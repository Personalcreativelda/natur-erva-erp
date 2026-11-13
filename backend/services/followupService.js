/**
 * Automações de follow-up: mensagens que acompanham o cliente (WhatsApp pela Evolution API, com email
 * de reserva conforme o modo das notificações aos clientes).
 *
 * Cada regra pode ser ligada/desligada e ter tempos e textos editados no painel (Marketing › Automações).
 * Salvaguardas:
 *   • só envia entre as 08:00 e as 20:00 (Maputo); máximo de envios por ronda e pausa entre mensagens
 *     (o WhatsApp bloqueia números que enviam em rajada)
 *   • cada mensagem é registada em followup_log antes de sair → nunca se repete
 *   • ao ligar uma regra só conta o que acontecer DEPOIS (não manda nada sobre pedidos antigos)
 *   • regras promocionais respeitam o "SAIR" (marketing_optouts); avisos do pedido não
 */
import cron from 'node-cron';
import { randomBytes } from 'crypto';
import pool from '../db.js';
import { notifyCustomer, resolveOrderContact, ensureNotificationSchema } from './notificationService.js';
import { sendMarketingEmail } from './emailService.js';

const APP_URL = () => (process.env.APP_URL || process.env.FRONTEND_URL || 'https://www.natur-erva.co.mz').replace(/\/$/, '');
const MAX_PER_RUN = 40;
const QUIET_START_HOUR = 8;   // envia a partir das 08:00
const QUIET_END_HOUR = 20;    // e até às 20:00 (hora de Maputo)
export const OPT_OUT_FOOTER = '\n\n_Responda SAIR para não receber promoções._';

// ── Regras disponíveis (valores por omissão) ──────────────────────────────────────────────────────
export const RULES = [
  {
    key: 'payment_reminder',
    title: 'Pagamento pendente',
    category: 'Pedidos',
    marketing: false,
    defaultEnabled: true,
    description: 'Lembra quem fez um pedido mas ainda não pagou nem enviou o código da transação. Pára assim que pagar.',
    defaultConfig: { stepsHours: [2, 24, 72] },
    subject: 'O seu pedido #{pedido} aguarda pagamento',
    templates: [
      'Olá {nome}! O seu pedido *#{pedido}* ({total}) está reservado e aguarda pagamento.\n\nPode pagar por M-Pesa ou e-Mola e enviar o código da transação aqui:\n👉 {link}',
      'Olá {nome}, ainda não recebemos o pagamento do pedido *#{pedido}* ({total}). Os produtos continuam reservados para si.\n\nPagar agora: {link}',
      'Olá {nome}, último lembrete: o pedido *#{pedido}* ({total}) ainda aguarda pagamento. Se já não o quiser, pode ignorar esta mensagem.\n\n👉 {link}',
    ],
  },
  {
    key: 'review_request',
    title: 'Pedir avaliação',
    category: 'Pedidos',
    marketing: false,
    defaultEnabled: true,
    description: 'Alguns dias depois da entrega, pede ao cliente que avalie os produtos (as avaliações aparecem na loja).',
    defaultConfig: { daysAfterDelivery: 2 },
    subject: 'O que achou do seu pedido #{pedido}?',
    templates: [
      'Olá {nome}! Já experimentou os produtos do pedido *#{pedido}*? ⭐\n\nA sua opinião ajuda outros clientes a escolher. Deixe a sua avaliação aqui (leva 1 minuto):\n👉 {link}',
    ],
  },
  {
    key: 'repurchase',
    title: 'Lembrete de recompra',
    category: 'Fidelização',
    marketing: true,
    defaultEnabled: false,
    description: 'Quando o produto que comprou pode estar a acabar, sugere encomendar de novo (se ainda não voltou a comprar).',
    defaultConfig: { daysAfterDelivery: 25 },
    subject: 'Está na hora de repor o seu {produto}?',
    templates: [
      'Olá {nome}! Já passaram algumas semanas desde que recebeu *{produto}*. Se estiver a acabar, pode encomendar de novo aqui:\n👉 {link}\n\nObrigado por confiar na {loja}!',
    ],
  },
  {
    key: 'winback',
    title: 'Cliente inactivo',
    category: 'Fidelização',
    marketing: true,
    defaultEnabled: false,
    description: 'Clientes sem compras há algum tempo recebem uma mensagem para voltar, com um cupão pessoal opcional.',
    defaultConfig: { inactiveDays: 60, couponPercent: 10, couponValidDays: 14, repeatAfterDays: 120 },
    subject: 'Sentimos a sua falta, {nome}',
    templates: [
      'Olá {nome}, sentimos a sua falta na {loja}! 💚\n\nPara voltar, oferecemos *{desconto}% de desconto* na próxima compra com o cupão *{cupao}* (válido até {validade}).\n\n👉 {link}',
    ],
  },
  {
    key: 'loyalty_coupon',
    title: 'Cupão por volume de compras',
    category: 'Fidelização',
    marketing: true,
    defaultEnabled: false,
    description: 'Quando o total de compras pagas do cliente ultrapassa um nível, gera um cupão pessoal de uso único e envia-o.',
    defaultConfig: {
      tiers: [{ minSpent: 5000, percent: 5 }, { minSpent: 15000, percent: 10 }, { minSpent: 30000, percent: 15 }],
      couponValidDays: 30,
    },
    subject: 'Um presente para si, {nome}',
    templates: [
      'Parabéns, {nome}! 🎉 As suas compras na {loja} já ultrapassaram *{nivel}*.\n\nComo agradecimento, aqui está um cupão de *{desconto}% de desconto*: *{cupao}* (uso único, válido até {validade}).\n\n👉 {link}',
    ],
  },
  {
    key: 'new_products',
    title: 'Novidades e promoções',
    category: 'Promoções',
    marketing: true,
    defaultEnabled: false,
    description: 'Produtos novos na loja ou promoções que começaram são anunciados num resumo aos clientes que já compraram.',
    defaultConfig: { minDaysBetween: 7, maxProducts: 3 },
    subject: 'Novidades na {loja}',
    templates: [
      'Olá {nome}! Novidades na {loja}:\n\n{produtos}\n\nVeja tudo aqui: {link}',
    ],
  },
  {
    key: 'coupon_expiring',
    title: 'Cupão a expirar',
    category: 'Promoções',
    marketing: true,
    defaultEnabled: true,
    description: 'Lembra o cliente quando um cupão pessoal (gerado por estas automações) expira dentro de poucos dias e ainda não foi usado.',
    defaultConfig: { daysBefore: 3 },
    subject: 'O seu cupão {cupao} está a expirar',
    templates: [
      'Olá {nome}, o seu cupão *{cupao}* ({desconto}% de desconto) expira a {validade}. Não o deixe escapar!\n\n👉 {link}',
    ],
  },
];
const RULE_MAP = Object.fromEntries(RULES.map(r => [r.key, r]));

// ── Esquema ─────────────────────────────────────────────────────────────────────────────────────
const schemaReady = (async () => {
  const q = (sql) => pool.query(sql).catch(err => console.warn('[followups schema]', err.message));
  await ensureNotificationSchema();
  await q(`CREATE TABLE IF NOT EXISTS followup_rules (
    key TEXT PRIMARY KEY,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    templates JSONB,
    enabled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS followup_log (
    id SERIAL PRIMARY KEY,
    rule_key TEXT NOT NULL,
    target_key TEXT NOT NULL,
    step INT NOT NULL DEFAULT 0,
    recipient TEXT,
    result TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rule_key, target_key, step)
  )`);
  await q(`CREATE TABLE IF NOT EXISTS followup_coupons (
    code TEXT PRIMARY KEY,
    phone TEXT,
    rule_key TEXT,
    percent NUMERIC,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS followup_broadcasts (
    id SERIAL PRIMARY KEY,
    rule_key TEXT NOT NULL,
    text TEXT NOT NULL,
    product_ids TEXT[] NOT NULL DEFAULT '{}',
    done BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Regras novas entram com o estado por omissão; as já guardadas não mudam
  for (const r of RULES) {
    await pool.query(
      `INSERT INTO followup_rules (key, enabled, config, enabled_at) VALUES ($1, $2, $3::jsonb, CASE WHEN $2 THEN NOW() END)
       ON CONFLICT (key) DO NOTHING`,
      [r.key, r.defaultEnabled, JSON.stringify(r.defaultConfig)]
    ).catch(err => console.warn('[followups seed]', err.message));
  }
})();
export const ensureFollowupSchema = () => schemaReady;

// ── Utilitários ─────────────────────────────────────────────────────────────────────────────────
const fmtMT = (n) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
const fmtDate = (d) => new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' });
const firstName = (name) => {
  const f = String(name || 'cliente').trim().split(/\s+/)[0] || 'cliente';
  return f.charAt(0).toLocaleUpperCase('pt') + f.slice(1).toLocaleLowerCase('pt');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PHONE_KEY_SQL = `right(regexp_replace(coalesce(o.customer_phone, ''), '\\D', '', 'g'), 9)`;

/** Substitui {variaveis}. Linhas cuja variável está vazia são removidas (ex.: sem cupão → sem linha do cupão). */
export function renderTemplate(template, vars) {
  return String(template || '')
    .split('\n')
    .filter(line => !/\{(\w+)\}/.test(line) || [...line.matchAll(/\{(\w+)\}/g)].every(m => vars[m[1]] !== undefined && vars[m[1]] !== null && vars[m[1]] !== ''))
    .join('\n')
    .replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const textToHtml = (text) => String(text)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/_([^_\n]+)_/g, '<em>$1</em>')
  .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
  .split('\n').map(l => (l ? `<p style="margin:0 0 8px">${l}</p>` : '')).join('');

let storeNameCache = null;
async function storeName() {
  if (storeNameCache) return storeNameCache;
  if (process.env.STORE_NAME?.trim()) return (storeNameCache = process.env.STORE_NAME.trim());
  const { rows } = await pool.query('SELECT company_name FROM tax_config LIMIT 1').catch(() => ({ rows: [] }));
  // Razão social → nome comercial: "Natur-Erva Sociedade Unipessoal, Lda" → "Natur-Erva"
  const cleaned = String(rows[0]?.company_name || '')
    .replace(/\b(sociedade\s+unipessoal|sociedade\s+an[oó]nima|limitada|lda\.?|s\.?\s?a\.?|e\.?\s?i\.?)(?=\s|,|$)/gi, '')
    .replace(/[,\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
  storeNameCache = cleaned || 'a nossa loja';
  return storeNameCache;
}

function maputoHour() {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Africa/Maputo' }).format(new Date()));
}

async function loadRules() {
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM followup_rules');
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  return RULES.map(def => {
    const row = byKey[def.key] || {};
    const templates = Array.isArray(row.templates) && row.templates.length ? row.templates : def.templates;
    return {
      ...def,
      enabled: !!row.enabled,
      enabledAt: row.enabled_at || null,
      config: { ...def.defaultConfig, ...(row.config || {}) },
      templates: def.templates.map((t, i) => (typeof templates[i] === 'string' && templates[i].trim() ? templates[i] : t)),
    };
  });
}

/** Reserva a mensagem (rule, alvo, passo). false se já tinha sido enviada. */
async function claim(ruleKey, targetKey, step, recipient) {
  const { rowCount } = await pool.query(
    `INSERT INTO followup_log (rule_key, target_key, step, recipient, result) VALUES ($1, $2, $3, $4, 'pending')
     ON CONFLICT (rule_key, target_key, step) DO NOTHING`,
    [ruleKey, targetKey, step, recipient || null]
  );
  return rowCount > 0;
}

async function createPersonalCoupon({ ruleKey, phone, percent, validDays, name, description }) {
  const prefix = String(name || 'NE').normalize('NFD').replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'NE';
  const validUntil = new Date(Date.now() + validDays * 86400000);
  for (let i = 0; i < 5; i++) {
    const code = `${prefix}${randomBytes(3).toString('hex').toUpperCase()}`;
    try {
      await pool.query(
        `INSERT INTO coupons (code, description, type, value, min_order_amount, max_uses, valid_from, valid_until, is_active)
         VALUES ($1, $2, 'percentage', $3, 0, 1, NOW(), $4, true)`,
        [code, description, percent, validUntil]
      );
      await pool.query(
        `INSERT INTO followup_coupons (code, phone, rule_key, percent, valid_until) VALUES ($1, $2, $3, $4, $5)`,
        [code, phone, ruleKey, percent, validUntil]
      );
      return { code, validUntil };
    } catch (err) {
      if (err.code !== '23505') throw err; // código repetido → tenta outro
    }
  }
  throw new Error('Não foi possível gerar um código de cupão único');
}

// ── Candidatos por regra ────────────────────────────────────────────────────────────────────────
// Cada candidato: { targetKey, step, orderId, vars (sem nome/loja), templateIndex, beforeSend? }

async function candidatesPaymentReminder(rule) {
  const steps = (rule.config.stepsHours || []).map(Number).filter(h => h > 0).slice(0, rule.templates.length);
  if (!steps.length) return [];
  const { rows } = await pool.query(
    `SELECT o.id, o.order_number, o.total_amount, o.created_at,
            EXTRACT(EPOCH FROM (NOW() - o.created_at)) / 3600 AS age_h,
            (SELECT COUNT(*) FROM followup_log l WHERE l.rule_key = 'payment_reminder' AND l.target_key = o.id::text)::int AS sent,
            (SELECT MAX(l.created_at) FROM followup_log l WHERE l.rule_key = 'payment_reminder' AND l.target_key = o.id::text) AS last_sent
       FROM orders o
      WHERE o.payment_status IS DISTINCT FROM 'paid'
        AND o.status = 'pending'
        AND o.payment_submitted_at IS NULL
        AND o.created_at >= $1
        AND o.created_at >= NOW() - INTERVAL '10 days'
      ORDER BY o.created_at`,
    [rule.enabledAt || new Date()]
  );
  const out = [];
  for (const o of rows) {
    const next = o.sent;
    if (next >= steps.length || Number(o.age_h) < steps[next]) continue;
    // Entre lembretes, pelo menos 6 h (ao ligar tarde não manda vários de seguida)
    if (o.last_sent && Date.now() - new Date(o.last_sent).getTime() < 6 * 3600000) continue;
    out.push({
      targetKey: String(o.id), step: next, orderId: o.id, templateIndex: next,
      vars: { pedido: o.order_number, total: fmtMT(o.total_amount), link: `${APP_URL()}/minha-conta/encomendas/${o.id}` },
    });
  }
  return out;
}

async function candidatesReviewRequest(rule) {
  const days = Math.max(0, Number(rule.config.daysAfterDelivery) || 2);
  const { rows } = await pool.query(
    `SELECT o.id, o.order_number
       FROM orders o
      WHERE o.status IN ('delivered', 'completed')
        AND COALESCE(o.delivered_at, o.updated_at) <= NOW() - ($2 || ' days')::interval
        AND COALESCE(o.delivered_at, o.updated_at) >= GREATEST($1::timestamptz, NOW() - INTERVAL '30 days')
        AND NOT EXISTS (SELECT 1 FROM followup_log l WHERE l.rule_key = 'review_request' AND l.target_key = o.id::text)
        AND NOT EXISTS (
          SELECT 1 FROM product_reviews pr
           WHERE pr.order_id = o.id::text
              OR (o.created_by IS NOT NULL AND pr.user_id = o.created_by::text AND pr.created_at >= o.created_at)
        )`,
    [rule.enabledAt || new Date(), String(days)]
  ).catch(err => { console.warn('[followups] review_request:', err.message); return { rows: [] }; });
  return rows.map(o => ({
    targetKey: String(o.id), step: 0, orderId: o.id, templateIndex: 0,
    vars: { pedido: o.order_number, link: `${APP_URL()}/minha-conta` },
  }));
}

async function candidatesRepurchase(rule) {
  const days = Math.max(1, Number(rule.config.daysAfterDelivery) || 25);
  const { rows } = await pool.query(
    `SELECT o.id, o.items, ${PHONE_KEY_SQL} AS pk
       FROM orders o
      WHERE o.status IN ('delivered', 'completed')
        AND COALESCE(o.delivered_at, o.updated_at) <= NOW() - ($2 || ' days')::interval
        AND COALESCE(o.delivered_at, o.updated_at) >= GREATEST($1::timestamptz - ($2 || ' days')::interval, NOW() - ($2 || ' days')::interval - INTERVAL '10 days')
        AND ${PHONE_KEY_SQL} ~ '^8[2-7][0-9]{7}$'
        AND NOT EXISTS (SELECT 1 FROM followup_log l WHERE l.rule_key = 'repurchase' AND l.target_key = o.id::text)
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
           WHERE right(regexp_replace(coalesce(o2.customer_phone, ''), '\\D', '', 'g'), 9) = ${PHONE_KEY_SQL}
             AND o2.created_at > o.created_at AND o2.status <> 'cancelled'
        )`,
    [rule.enabledAt || new Date(), String(days)]
  ).catch(err => { console.warn('[followups] repurchase:', err.message); return { rows: [] }; });
  return rows.map(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    const product = items[0]?.productName || items[0]?.name || 'os seus produtos';
    return {
      targetKey: String(o.id), step: 0, orderId: o.id, templateIndex: 0,
      vars: { produto: product, link: `${APP_URL()}/` },
    };
  });
}

/** Clientes agregados pelo telefone (a identidade no WhatsApp). */
async function customerAggregates() {
  const { rows } = await pool.query(
    `SELECT ${PHONE_KEY_SQL} AS pk,
            MAX(o.created_at) AS last_order_at,
            COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status = 'paid'), 0)::float AS spent,
            (ARRAY_AGG(o.id ORDER BY o.created_at DESC))[1] AS last_order_id
       FROM orders o
      WHERE o.status <> 'cancelled' AND ${PHONE_KEY_SQL} ~ '^8[2-7][0-9]{7}$'
      GROUP BY 1`
  );
  return rows;
}

async function candidatesWinback(rule) {
  const inactive = Math.max(7, Number(rule.config.inactiveDays) || 60);
  const repeat = Math.max(inactive, Number(rule.config.repeatAfterDays) || 120);
  const customers = await customerAggregates();
  const enabledAt = rule.enabledAt ? new Date(rule.enabledAt).getTime() : Date.now();
  const out = [];
  for (const c of customers) {
    const last = new Date(c.last_order_at).getTime();
    // Inactivo há N dias, e o limite foi atravessado depois de a regra ser ligada (não dispara para todos de uma vez)
    if (Date.now() - last < inactive * 86400000) continue;
    if (last + inactive * 86400000 < enabledAt) continue;
    // Um envio por período de inactividade (identificado pela última encomenda); nunca mais de um por "repeat" dias
    const { rows: recentWin } = await pool.query(
      `SELECT 1 FROM followup_log WHERE rule_key = 'winback' AND target_key LIKE $1 AND created_at > NOW() - ($2 || ' days')::interval LIMIT 1`,
      [`${c.pk}:%`, String(repeat)]
    );
    if (recentWin.length) continue;
    out.push({
      targetKey: `${c.pk}:${c.last_order_id}`, step: 0, orderId: c.last_order_id, templateIndex: 0, phoneKey: c.pk,
      vars: { link: `${APP_URL()}/` },
      async beforeSend(contact) {
        const percent = Number(rule.config.couponPercent) || 0;
        if (percent <= 0) return {};
        const coupon = await createPersonalCoupon({
          ruleKey: 'winback', phone: c.pk, percent, validDays: Number(rule.config.couponValidDays) || 14,
          name: contact.name, description: `Cupão de regresso — ${contact.name || c.pk}`,
        });
        return { cupao: coupon.code, desconto: percent, validade: fmtDate(coupon.validUntil) };
      },
    });
  }
  return out;
}

async function candidatesLoyaltyCoupon(rule) {
  const tiers = (rule.config.tiers || [])
    .map(t => ({ minSpent: Number(t.minSpent) || 0, percent: Number(t.percent) || 0 }))
    .filter(t => t.minSpent > 0 && t.percent > 0)
    .sort((a, b) => a.minSpent - b.minSpent);
  if (!tiers.length) return [];
  const customers = await customerAggregates();
  const { rows: done } = await pool.query(`SELECT target_key FROM followup_log WHERE rule_key = 'loyalty_coupon'`);
  const doneSet = new Set(done.map(r => r.target_key));
  const out = [];
  for (const c of customers) {
    const reached = tiers.filter(t => c.spent >= t.minSpent);
    if (!reached.length) continue;
    const top = reached[reached.length - 1];
    if (doneSet.has(`${c.pk}:${top.minSpent}`)) continue;
    // Níveis abaixo já atingidos ficam marcados sem mensagem (só se envia o mais alto)
    for (const lower of reached.slice(0, -1)) {
      if (!doneSet.has(`${c.pk}:${lower.minSpent}`)) {
        await pool.query(
          `INSERT INTO followup_log (rule_key, target_key, step, result) VALUES ('loyalty_coupon', $1, 0, 'nível inferior (sem envio)')
           ON CONFLICT DO NOTHING`, [`${c.pk}:${lower.minSpent}`]
        ).catch(() => {});
      }
    }
    out.push({
      targetKey: `${c.pk}:${top.minSpent}`, step: 0, orderId: c.last_order_id, templateIndex: 0, phoneKey: c.pk,
      vars: { nivel: fmtMT(top.minSpent), link: `${APP_URL()}/` },
      async beforeSend(contact) {
        const coupon = await createPersonalCoupon({
          ruleKey: 'loyalty_coupon', phone: c.pk, percent: top.percent, validDays: Number(rule.config.couponValidDays) || 30,
          name: contact.name, description: `Cupão de fidelidade ${top.percent}% — ${contact.name || c.pk}`,
        });
        return { cupao: coupon.code, desconto: top.percent, validade: fmtDate(coupon.validUntil) };
      },
    });
  }
  return out;
}

async function candidatesNewProducts(rule) {
  // 1. Produtos novos / promoções que começaram, ainda não anunciados → novo resumo
  const { rows: pending } = await pool.query(`SELECT * FROM followup_broadcasts WHERE rule_key = 'new_products' AND NOT done ORDER BY id LIMIT 1`);
  let broadcast = pending[0];
  if (!broadcast) {
    const minDays = Math.max(1, Number(rule.config.minDaysBetween) || 7);
    const { rows: recent } = await pool.query(
      `SELECT 1 FROM followup_broadcasts WHERE rule_key = 'new_products' AND created_at > NOW() - ($1 || ' days')::interval LIMIT 1`, [String(minDays)]
    );
    if (recent.length) return [];
    const { rows: products } = await pool.query(
      `SELECT p.id::text, p.name, p.slug, p.price, p.promotional_price, p.promotional_price_start, p.created_at
         FROM products p
        WHERE p.show_in_shop IS TRUE
          AND (p.created_at >= GREATEST($1::timestamptz, NOW() - INTERVAL '7 days')
               OR (p.promotional_price > 0 AND p.promotional_price_start >= GREATEST($1::timestamptz, NOW() - INTERVAL '7 days')::date
                   AND p.promotional_price_start <= CURRENT_DATE
                   AND (p.promotional_price_end IS NULL OR p.promotional_price_end >= CURRENT_DATE)))
          AND NOT EXISTS (SELECT 1 FROM followup_broadcasts b WHERE b.rule_key = 'new_products' AND p.id::text = ANY(b.product_ids))
        ORDER BY p.created_at DESC
        LIMIT $2`,
      [rule.enabledAt || new Date(), Math.max(1, Number(rule.config.maxProducts) || 3)]
    );
    if (!products.length) return [];
    const lines = products.map(p => {
      const promo = Number(p.promotional_price) > 0 && Number(p.promotional_price) < Number(p.price);
      const price = promo ? `~${fmtMT(p.price)}~ *${fmtMT(p.promotional_price)}*` : fmtMT(p.price);
      return `• *${p.name}* — ${price}\n  ${APP_URL()}/loja/produto/${p.slug}`;
    });
    const { rows } = await pool.query(
      `INSERT INTO followup_broadcasts (rule_key, text, product_ids) VALUES ('new_products', $1, $2) RETURNING *`,
      [lines.join('\n'), products.map(p => p.id)]
    );
    broadcast = rows[0];
  }
  // 2. Destinatários: clientes que já compraram, ainda sem este resumo
  const { rows: customers } = await pool.query(
    `SELECT ${PHONE_KEY_SQL} AS pk, (ARRAY_AGG(o.id ORDER BY o.created_at DESC))[1] AS last_order_id
       FROM orders o
      WHERE o.status <> 'cancelled' AND ${PHONE_KEY_SQL} ~ '^8[2-7][0-9]{7}$'
        AND NOT EXISTS (SELECT 1 FROM followup_log l WHERE l.rule_key = 'new_products' AND l.target_key = $1 || ':' || ${PHONE_KEY_SQL})
      GROUP BY 1`,
    [`bc${broadcast.id}`]
  );
  if (!customers.length) {
    await pool.query('UPDATE followup_broadcasts SET done = TRUE WHERE id = $1', [broadcast.id]);
    return [];
  }
  return customers.map(c => ({
    targetKey: `bc${broadcast.id}:${c.pk}`, step: 0, orderId: c.last_order_id, templateIndex: 0, phoneKey: c.pk,
    vars: { produtos: broadcast.text, link: `${APP_URL()}/` },
  }));
}

async function candidatesCouponExpiring(rule) {
  const days = Math.max(1, Number(rule.config.daysBefore) || 3);
  const { rows } = await pool.query(
    `SELECT fc.code, fc.phone, fc.percent, fc.valid_until,
            (SELECT (ARRAY_AGG(o.id ORDER BY o.created_at DESC))[1] FROM orders o WHERE ${PHONE_KEY_SQL} = fc.phone) AS last_order_id
       FROM followup_coupons fc
       JOIN coupons c ON c.code = fc.code
      WHERE c.is_active AND COALESCE(c.current_uses, 0) = 0
        AND fc.valid_until > NOW() AND fc.valid_until <= NOW() + ($1 || ' days')::interval
        AND NOT EXISTS (SELECT 1 FROM followup_log l WHERE l.rule_key = 'coupon_expiring' AND l.target_key = fc.code)`,
    [String(days)]
  ).catch(err => { console.warn('[followups] coupon_expiring:', err.message); return { rows: [] }; });
  return rows.filter(r => r.last_order_id).map(r => ({
    targetKey: r.code, step: 0, orderId: r.last_order_id, templateIndex: 0, phoneKey: r.phone,
    vars: { cupao: r.code, desconto: Number(r.percent), validade: fmtDate(r.valid_until), link: `${APP_URL()}/` },
  }));
}

const CANDIDATES = {
  payment_reminder: candidatesPaymentReminder,
  review_request: candidatesReviewRequest,
  repurchase: candidatesRepurchase,
  winback: candidatesWinback,
  loyalty_coupon: candidatesLoyaltyCoupon,
  new_products: candidatesNewProducts,
  coupon_expiring: candidatesCouponExpiring,
};

// ── Execução ────────────────────────────────────────────────────────────────────────────────────
let running = false;

/**
 * Uma ronda: percorre as regras ligadas e envia o que estiver devido.
 * @param force  ignora o horário (botão "Executar agora" no painel)
 */
export async function runFollowups({ force = false } = {}) {
  if (running) return { skipped: 'já em execução' };
  running = true;
  const summary = { sent: 0, failed: 0, skipped: 0, byRule: {} };
  try {
    await schemaReady;
    const hour = maputoHour();
    if (!force && (hour < QUIET_START_HOUR || hour >= QUIET_END_HOUR)) return { skipped: 'fora do horário (08:00–20:00)' };
    // Sem WhatsApp configurado, notifyCustomer usa o email (conforme o modo das notificações)
    const rules = (await loadRules()).filter(r => r.enabled);
    const loja = await storeName();
    let budget = MAX_PER_RUN;

    for (const rule of rules) {
      if (budget <= 0) break;
      let list = [];
      try { list = await CANDIDATES[rule.key](rule); } catch (err) { console.warn(`[followups] ${rule.key}:`, err.message); continue; }
      for (const cand of list) {
        if (budget <= 0) break;
        const contact = await resolveOrderContact(cand.orderId).catch(() => null);
        if (!contact || (!contact.phone && !contact.email)) { summary.skipped++; continue; }
        // Reserva antes de enviar: nunca duplica, mesmo que falhe a meio
        if (!(await claim(rule.key, cand.targetKey, cand.step, contact.phone || contact.email))) continue;

        let extra = {};
        try { if (cand.beforeSend) extra = await cand.beforeSend(contact); } catch (err) {
          await pool.query(`UPDATE followup_log SET result = $4 WHERE rule_key = $1 AND target_key = $2 AND step = $3`,
            [rule.key, cand.targetKey, cand.step, `erro: ${err.message}`.slice(0, 200)]);
          summary.failed++; continue;
        }
        const vars = { nome: firstName(contact.name), loja, ...cand.vars, ...extra };
        let text = renderTemplate(rule.templates[cand.templateIndex] || rule.templates[0], vars);
        if (rule.marketing) text += OPT_OUT_FOOTER;
        const subject = renderTemplate(rule.subject, vars);

        const result = await notifyCustomer({
          contact,
          orderId: contact.order?.id,
          event: `followup_${rule.key}`,
          whatsapp: text,
          marketing: rule.marketing,
          sendEmail: contact.email ? () => sendMarketingEmail({ to: contact.email, subject, body: textToHtml(text) }) : null,
        });
        const ok = result.whatsapp === 'sent' || String(result.email).startsWith('sent');
        const optedOut = result.whatsapp === 'opted_out';
        await pool.query(`UPDATE followup_log SET result = $4 WHERE rule_key = $1 AND target_key = $2 AND step = $3`,
          [rule.key, cand.targetKey, cand.step,
            optedOut ? 'ignorado (respondeu SAIR)' : ok ? `whatsapp:${result.whatsapp} email:${result.email}` : `falhou (${result.whatsapp}/${result.email})`]);
        summary.byRule[rule.key] = (summary.byRule[rule.key] || 0) + (ok ? 1 : 0);
        if (ok) { summary.sent++; budget--; } else if (optedOut) summary.skipped++; else summary.failed++;
        if (result.whatsapp === 'sent') await sleep(4000 + Math.random() * 5000); // ritmo humano no WhatsApp
      }
    }
    if (summary.sent || summary.failed) console.log('[followups] ronda:', JSON.stringify(summary));
    return summary;
  } finally {
    running = false;
  }
}

export function startFollowupJob() {
  // O backend local usa a MESMA base de dados e Evolution da produção: com FOLLOWUPS_JOB=off no .env
  // local, o agendamento não corre aí (senão os clientes recebiam mensagens a partir do computador
  // de desenvolvimento, e em duplicado). "Executar agora" no painel continua a funcionar.
  if (String(process.env.FOLLOWUPS_JOB || '').toLowerCase() === 'off') {
    console.log('📨 Automações de follow-up: agendamento desligado (FOLLOWUPS_JOB=off)');
    return;
  }
  // De 10 em 10 minutos; o horário de envio é verificado em runFollowups
  cron.schedule('*/10 * * * *', () => { runFollowups().catch(err => console.error('[followups]', err.message)); }, { timezone: 'Africa/Maputo' });
  setTimeout(() => runFollowups().catch(() => {}), 60_000);
  console.log('📨 Automações de follow-up agendadas (cada 10 min, 08:00–20:00)');
}

// ── API do painel ───────────────────────────────────────────────────────────────────────────────
export async function listRules() {
  const rules = await loadRules();
  const { rows } = await pool.query(
    `SELECT rule_key, COUNT(*) FILTER (WHERE result LIKE 'whatsapp:%')::int AS sent,
            COUNT(*) FILTER (WHERE result LIKE 'falhou%' OR result LIKE 'erro%')::int AS failed,
            MAX(created_at) AS last_at
       FROM followup_log WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY rule_key`
  );
  const stats = Object.fromEntries(rows.map(r => [r.rule_key, r]));
  return rules.map(r => ({
    key: r.key, title: r.title, category: r.category, description: r.description, marketing: r.marketing,
    enabled: r.enabled, enabledAt: r.enabledAt, config: r.config, templates: r.templates,
    defaultTemplates: RULE_MAP[r.key].templates, subject: r.subject,
    stats: { sent30d: stats[r.key]?.sent || 0, failed30d: stats[r.key]?.failed || 0, lastAt: stats[r.key]?.last_at || null },
  }));
}

export async function updateRule(key, { enabled, config, templates }) {
  const def = RULE_MAP[key];
  if (!def) throw Object.assign(new Error('Regra desconhecida'), { status: 404 });
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM followup_rules WHERE key = $1', [key]);
  const current = rows[0] || {};
  const nextEnabled = enabled === undefined ? !!current.enabled : !!enabled;
  // Ao ligar, só conta o que acontecer a partir de agora
  const enabledAt = nextEnabled && !current.enabled ? new Date() : current.enabled_at || null;
  const nextConfig = config && typeof config === 'object' ? { ...def.defaultConfig, ...(current.config || {}), ...config } : current.config || def.defaultConfig;
  const nextTemplates = Array.isArray(templates)
    ? def.templates.map((t, i) => (typeof templates[i] === 'string' && templates[i].trim() ? String(templates[i]).slice(0, 1500) : t))
    : current.templates || null;
  await pool.query(
    `INSERT INTO followup_rules (key, enabled, config, templates, enabled_at, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, NOW())
     ON CONFLICT (key) DO UPDATE SET enabled = $2, config = $3::jsonb, templates = $4::jsonb, enabled_at = $5, updated_at = NOW()`,
    [key, nextEnabled, JSON.stringify(nextConfig), nextTemplates ? JSON.stringify(nextTemplates) : null, enabledAt]
  );
  return (await listRules()).find(r => r.key === key);
}

export async function previewRule(key, templateIndex = 0, template) {
  const def = RULE_MAP[key];
  if (!def) throw Object.assign(new Error('Regra desconhecida'), { status: 404 });
  const rules = await loadRules();
  const rule = rules.find(r => r.key === key);
  const sample = {
    nome: 'Ana', loja: await storeName(), pedido: '128', total: fmtMT(3393), link: `${APP_URL()}/minha-conta`,
    produto: 'Chá Verde Orgânico', cupao: 'ANA7F3K2', desconto: 10, validade: fmtDate(Date.now() + 14 * 86400000),
    nivel: fmtMT(15000),
    produtos: `• *Óleo de Coco 500ml* — ~${fmtMT(850)}~ *${fmtMT(690)}*\n  ${APP_URL()}/loja/produto/oleo-de-coco\n• *Moringa em Pó* — ${fmtMT(450)}\n  ${APP_URL()}/loja/produto/moringa`,
  };
  let text = renderTemplate(template ?? rule.templates[templateIndex] ?? rule.templates[0], sample);
  if (def.marketing) text += OPT_OUT_FOOTER;
  return { text };
}

export async function recentFollowups(limit = 50) {
  await schemaReady;
  const { rows } = await pool.query(
    `SELECT id, rule_key, target_key, step, recipient, result, created_at FROM followup_log
      WHERE result IS DISTINCT FROM 'pending' AND recipient IS NOT NULL
      ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)]
  );
  return rows;
}
