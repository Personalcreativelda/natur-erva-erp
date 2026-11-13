/**
 * Notificações aos CLIENTES (confirmação de pedido, estado da encomenda, pagamento).
 *
 * Canais: WhatsApp pela Evolution API (a mesma instância da assistente) e email.
 * Modo (assistant_config.customer_notify_mode):
 *   • whatsapp_first — WhatsApp; se o número não tiver WhatsApp ou o envio falhar, envia email (omissão)
 *   • both           — WhatsApp e email
 *   • email_only     — só email
 *
 * Isto só ENVIA mensagens. Respostas dos clientes continuam a ser ignoradas pelo webhook da assistente,
 * que só conversa com os números autorizados (routes/assistant.js).
 */
import pool from '../db.js';

const schemaReady = (async () => {
  const q = (sql) => pool.query(sql).catch(err => console.warn('[notifications schema]', err.message));
  await q(`ALTER TABLE assistant_config ADD COLUMN IF NOT EXISTS customer_notify_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await q(`ALTER TABLE assistant_config ADD COLUMN IF NOT EXISTS customer_notify_mode TEXT NOT NULL DEFAULT 'whatsapp_first'`);
  await q(`CREATE TABLE IF NOT EXISTS customer_notifications (
    id SERIAL PRIMARY KEY,
    order_id TEXT,
    event TEXT NOT NULL,
    channel TEXT NOT NULL,
    recipient TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await q(`CREATE INDEX IF NOT EXISTS customer_notifications_order_idx ON customer_notifications (order_id, created_at DESC)`);
  // Quem respondeu SAIR no WhatsApp deixa de receber mensagens promocionais (os avisos do pedido continuam)
  await q(`CREATE TABLE IF NOT EXISTS marketing_optouts (
    phone TEXT PRIMARY KEY,
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
})();

export const NOTIFY_MODES = ['whatsapp_first', 'both', 'email_only'];
export const ensureNotificationSchema = () => schemaReady;

async function getConfig() {
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1').catch(() => ({ rows: [] }));
  const c = rows[0] || {};
  const evolution = {
    baseUrl: String(c.evolution_base_url || '').replace(/\/$/, ''),
    instance: c.evolution_instance || '',
    apiKey: c.evolution_api_key || '',
  };
  return {
    enabled: c.customer_notify_enabled !== false,
    mode: NOTIFY_MODES.includes(c.customer_notify_mode) ? c.customer_notify_mode : 'whatsapp_first',
    evolution,
    evolutionReady: !!(evolution.baseUrl && evolution.instance && evolution.apiKey),
  };
}

// ── Telefone ────────────────────────────────────────────────────────────────────────────────────
/** Número em formato internacional só com dígitos (Moçambique por omissão). null se não parecer real. */
export function normalizePhone(raw) {
  if (!raw || /^(no_phone_|np_)/i.test(String(raw))) return null;
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^8[2-7]\d{7}$/.test(d)) return `258${d}`;           // 84xxxxxxx → 25884xxxxxxx
  if (/^2588[2-7]\d{7}$/.test(d)) return d;                 // já com indicativo
  if (d.length >= 10 && d.length <= 15 && !d.startsWith('0')) return d; // outro país
  return null;
}

// ── Evolution API ───────────────────────────────────────────────────────────────────────────────
async function evolutionFetch(evo, path, body) {
  const res = await fetch(`${evo.baseUrl}${path}/${encodeURIComponent(evo.instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evo.apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const err = new Error(`Evolution API ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`.slice(0, 400));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** true / false se a Evolution souber dizer; null se a verificação não estiver disponível. */
async function hasWhatsApp(evo, phone) {
  try {
    const data = await evolutionFetch(evo, '/chat/whatsappNumbers', { numbers: [phone] });
    const entry = Array.isArray(data) ? data[0] : null;
    return entry && typeof entry.exists === 'boolean' ? entry.exists : null;
  } catch {
    return null;
  }
}

async function sendWhatsApp(evo, phone, text) {
  const exists = await hasWhatsApp(evo, phone);
  if (exists === false) return { ok: false, error: 'Número sem WhatsApp' };
  try {
    await evolutionFetch(evo, '/message/sendText', { number: phone, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function logAttempt({ orderId, event, channel, recipient, status, error }) {
  await pool.query(
    `INSERT INTO customer_notifications (order_id, event, channel, recipient, status, error) VALUES ($1, $2, $3, $4, $5, $6)`,
    [orderId ? String(orderId) : null, event, channel, recipient || null, status, error ? String(error).slice(0, 500) : null]
  ).catch(() => {});
}

// ── Contacto do cliente de um pedido ────────────────────────────────────────────────────────────
/**
 * Nome, email e telefone do CLIENTE do pedido. O número que o cliente pôs no pedido tem prioridade.
 * Num pedido criado pela equipa, created_by é o funcionário — por isso só se usa esse perfil se for cliente.
 */
export async function resolveOrderContact(orderOrId) {
  let order = orderOrId;
  if (!order || typeof order !== 'object') {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderOrId]);
    order = rows[0];
  }
  if (!order) return null;

  let name = order.customer_name || null;
  let email = null;
  let phone = normalizePhone(order.customer_phone);
  const take = (r) => {
    if (!r) return;
    name = name || r.name || null;
    email = email || r.email || null;
    phone = phone || normalizePhone(r.phone);
  };

  const safe = (sql, args) => pool.query(sql, args).then(r => r.rows[0]).catch(() => null);
  if (order.customer_id) {
    take(await safe('SELECT name, email, phone FROM profiles WHERE customer_id = $1 LIMIT 1', [order.customer_id]));
    take(await safe('SELECT name, email, phone FROM customers WHERE id = $1', [order.customer_id]));
  }
  if (order.created_by && (!email || !phone)) {
    const p = await safe(
      `SELECT p.name, p.email, p.phone, p.role,
              COALESCE(array_agg(r.name) FILTER (WHERE r.name IS NOT NULL), ARRAY[]::text[]) AS roles
         FROM profiles p
         LEFT JOIN user_roles ur ON ur.user_id = p.id
         LEFT JOIN roles r ON r.id = ur.role_id
        WHERE p.id = $1 GROUP BY p.id`,
      [order.created_by]
    );
    const roles = p ? (p.roles?.length ? p.roles : [p.role]).map(r => String(r || '').toUpperCase()) : [];
    if (p && roles.every(r => !r || r === 'CLIENTE')) take(p);
  }
  return { order, name: name || 'cliente', email, phone };
}

// ── Envio ───────────────────────────────────────────────────────────────────────────────────────
/**
 * @param contact     { name, email, phone } (resolveOrderContact)
 * @param event       ex.: 'order_created', 'status_delivered', 'payment_confirmed'
 * @param whatsapp    texto da mensagem de WhatsApp
 * @param sendEmail   () => Promise — envia o email (as funções de emailService)
 * @param channels    opcional { whatsapp: bool, email: bool } — escolha explícita da equipa (ignora o modo)
 */
export async function notifyCustomer({ contact, orderId, event, whatsapp, sendEmail, channels, marketing = false }) {
  try {
    if (!contact) return { whatsapp: 'skipped', email: 'skipped' };
    const cfg = await getConfig();
    if (!cfg.enabled && !channels) return { whatsapp: 'disabled', email: 'disabled' };
    // Mensagens promocionais respeitam o "SAIR" (avisos do pedido não)
    if (marketing && contact.phone && await isOptedOut(contact.phone)) return { whatsapp: 'opted_out', email: 'opted_out' };

    const wantWhatsApp = channels ? !!channels.whatsapp : cfg.mode !== 'email_only';
    const wantEmailAlways = channels ? !!channels.email : cfg.mode === 'both' || cfg.mode === 'email_only';
    const result = { whatsapp: 'skipped', email: 'skipped' };

    let waOk = false;
    if (wantWhatsApp && whatsapp) {
      if (!cfg.evolutionReady) {
        result.whatsapp = 'not_configured';
      } else if (!contact.phone) {
        result.whatsapp = 'no_phone';
      } else {
        const r = await sendWhatsApp(cfg.evolution, contact.phone, whatsapp);
        waOk = r.ok;
        result.whatsapp = r.ok ? 'sent' : 'failed';
        await logAttempt({ orderId, event, channel: 'whatsapp', recipient: contact.phone, status: result.whatsapp, error: r.error });
        if (!r.ok) console.warn(`[notify] WhatsApp falhou (${event}) → ${contact.phone}: ${r.error}`);
      }
    }

    // Email: sempre que pedido, ou como alternativa quando o WhatsApp não foi entregue
    const fallback = wantWhatsApp && !waOk && (!channels || channels.email !== false);
    if ((wantEmailAlways || fallback) && sendEmail) {
      if (!contact.email) {
        result.email = 'no_email';
      } else {
        try {
          await sendEmail();
          result.email = fallback && !wantEmailAlways ? 'sent_fallback' : 'sent';
        } catch (err) {
          result.email = 'failed';
          console.warn(`[notify] email falhou (${event}) → ${contact.email}: ${err.message}`);
        }
        await logAttempt({ orderId, event, channel: 'email', recipient: contact.email, status: result.email });
      }
    }
    return result;
  } catch (err) {
    console.warn('[notify] erro:', err.message);
    return { whatsapp: 'error', email: 'error' };
  }
}

/** Notificação a partir de um pedido (id ou linha): resolve o contacto e envia. Nunca lança. */
export async function notifyOrderCustomer(orderOrId, { event, whatsapp, sendEmail, channels, marketing = false }) {
  try {
    const contact = await resolveOrderContact(orderOrId);
    if (!contact) return null;
    const text = typeof whatsapp === 'function' ? whatsapp(contact) : whatsapp;
    const email = sendEmail ? () => sendEmail(contact) : null;
    return notifyCustomer({ contact, orderId: contact.order.id, event, whatsapp: text, sendEmail: email, channels, marketing });
  } catch (err) {
    console.warn('[notify] erro ao notificar pedido:', err.message);
    return null;
  }
}

export async function getNotificationSettings() {
  const cfg = await getConfig();
  return { enabled: cfg.enabled, mode: cfg.mode, evolutionReady: cfg.evolutionReady };
}

/** Últimos envios (para o painel). */
export async function listRecentNotifications(limit = 50) {
  await schemaReady;
  const { rows } = await pool.query(
    `SELECT n.id, n.order_id, n.event, n.channel, n.recipient, n.status, n.error, n.created_at, o.order_number
       FROM customer_notifications n
       LEFT JOIN orders o ON o.id::text = n.order_id
      ORDER BY n.created_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)]
  );
  return rows;
}

// ── Opt-out (SAIR / VOLTAR) ─────────────────────────────────────────────────────────────────────
const optKey = (phone) => {
  const n = normalizePhone(phone);
  return n ? n : null;
};

export async function isOptedOut(phone) {
  const key = optKey(phone);
  if (!key) return false;
  await schemaReady;
  const { rows } = await pool.query('SELECT 1 FROM marketing_optouts WHERE phone = $1', [key]).catch(() => ({ rows: [] }));
  return rows.length > 0;
}

export async function listOptedOutPhones() {
  await schemaReady;
  const { rows } = await pool.query('SELECT phone FROM marketing_optouts').catch(() => ({ rows: [] }));
  return new Set(rows.map(r => r.phone));
}

export async function setOptOut(phone, optedOut, source = 'whatsapp') {
  const key = optKey(phone);
  if (!key) return false;
  await schemaReady;
  if (optedOut) {
    await pool.query('INSERT INTO marketing_optouts (phone, source) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING', [key, source]);
  } else {
    await pool.query('DELETE FROM marketing_optouts WHERE phone = $1', [key]);
  }
  return true;
}

/**
 * Envio directo de WhatsApp a um cliente (campanhas de marketing e automações).
 * Devolve { ok, error, phone }. Não lança.
 */
export async function sendCustomerWhatsApp(rawPhone, text, { event = 'marketing', orderId = null } = {}) {
  try {
    const cfg = await getConfig();
    if (!cfg.evolutionReady) return { ok: false, error: 'Evolution API não configurada' };
    const phone = normalizePhone(rawPhone);
    if (!phone) return { ok: false, error: 'Número inválido' };
    const r = await sendWhatsApp(cfg.evolution, phone, text);
    await logAttempt({ orderId, event, channel: 'whatsapp', recipient: phone, status: r.ok ? 'sent' : 'failed', error: r.error });
    return { ...r, phone };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function isWhatsAppReady() {
  const cfg = await getConfig();
  return cfg.evolutionReady;
}

/** Envia uma mensagem de teste para um número qualquer (painel). */
export async function sendTestWhatsApp(rawPhone) {
  const cfg = await getConfig();
  if (!cfg.evolutionReady) return { ok: false, error: 'Configure primeiro a Evolution API (URL, instância e chave).' };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: 'Número inválido.' };
  const r = await sendWhatsApp(cfg.evolution, phone,
    '✅ Natur Erva: teste das notificações aos clientes. Se recebeu esta mensagem, está tudo pronto.');
  await logAttempt({ event: 'test', channel: 'whatsapp', recipient: phone, status: r.ok ? 'sent' : 'failed', error: r.error });
  return r.ok ? { ok: true, phone } : { ok: false, error: r.error === 'Número sem WhatsApp' ? 'Este número não tem WhatsApp.' : r.error };
}
