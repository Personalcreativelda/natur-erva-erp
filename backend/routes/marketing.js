import express from 'express';
import pool from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendMarketingEmail, buildMarketingEmailHtml } from '../services/emailService.js';
import { normalizePhone, listOptedOutPhones, sendCustomerWhatsApp, sendCustomerProductCards, isWhatsAppReady } from '../services/notificationService.js';
import { listShowcaseProducts, getShowcaseProducts, buildProductGridHtml, productCaption } from '../services/productShowcase.js';
import { OPT_OUT_FOOTER } from '../services/followupService.js';
import { randomBytes } from 'crypto';

const router = express.Router();

// Progresso dos envios por WhatsApp (os envios correm em segundo plano)
pool.query(`ALTER TABLE marketing_campaigns
  ADD COLUMN IF NOT EXISTS sent_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ`).catch(err => console.warn('[marketing schema]', err.message));

const firstName = (name) => {
  const f = String(name || 'cliente').trim().split(/\s+/)[0] || 'cliente';
  return f.charAt(0).toLocaleUpperCase('pt') + f.slice(1).toLocaleLowerCase('pt');
};
const personalize = (text, name) => String(text)
  .replace(/{nome}/gi, firstName(name))
  .replace(/{nome_completo}/gi, String(name || 'Cliente').trim());

/**
 * Todos os clientes contactáveis (perfis de clientes + clientes criados pela equipa), com email
 * e/ou telefone. Deduplicados por email; os clientes sem conta entram mesmo só com telefone.
 */
async function loadCustomers() {
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, points, order_count, source FROM (
       SELECT p.id::text AS id, p.name, NULLIF(p.email, '') AS email, NULLIF(p.phone, '') AS phone,
              COALESCE(p.points, 0) AS points,
              COUNT(DISTINCT o.id)::int AS order_count, 'profile' AS source
         FROM profiles p
         LEFT JOIN orders o ON o.created_by = p.id OR (p.customer_id IS NOT NULL AND o.customer_id = p.customer_id)
        WHERE p.is_active = true
          AND p.is_super_admin IS NOT TRUE
          AND COALESCE(p.role, 'CLIENTE') = 'CLIENTE'
          AND ((p.email IS NOT NULL AND p.email <> '') OR (p.phone IS NOT NULL AND p.phone <> ''))
        GROUP BY p.id
       UNION ALL
       SELECT c.id::text AS id, c.name, NULLIF(c.email, '') AS email, NULLIF(c.phone, '') AS phone,
              0 AS points, COUNT(DISTINCT o.id)::int AS order_count, 'customer' AS source
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
        WHERE ((c.email IS NOT NULL AND c.email <> '') OR (c.phone IS NOT NULL AND c.phone <> ''))
          AND NOT EXISTS (
            SELECT 1 FROM profiles p
             WHERE p.customer_id = c.id OR (c.email IS NOT NULL AND c.email <> '' AND LOWER(p.email) = LOWER(c.email))
          )
        GROUP BY c.id
     ) combined
     ORDER BY order_count DESC, name ASC`
  );
  const optedOut = await listOptedOutPhones();
  return rows.map(r => {
    const wa = normalizePhone(r.phone);
    return { ...r, whatsapp: wa, opted_out: !!(wa && optedOut.has(wa)) };
  });
}

// GET /api/marketing/customers
router.get('/customers', authMiddleware, async (_req, res) => {
  try {
    res.json(await loadCustomers());
  } catch (err) {
    console.error('[GET /marketing/customers]', err);
    res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// GET /api/marketing/whatsapp-status — se a Evolution API está pronta para envios
router.get('/whatsapp-status', authMiddleware, async (_req, res) => {
  res.json({ ready: await isWhatsAppReady() });
});

// GET /api/marketing/products — produtos para a montra (promoções primeiro)
router.get('/products', authMiddleware, async (_req, res) => {
  try {
    res.json(await listShowcaseProducts());
  } catch (err) {
    console.error('[GET /marketing/products]', err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

/** Corpo do email com a montra de produtos no fim. */
async function emailBodyWithProducts(body, productIds, productsTitle) {
  const products = await getShowcaseProducts(productIds);
  return `${body || ''}${buildProductGridHtml(products, { title: productsTitle })}`;
}

// POST /api/marketing/email-preview — HTML final do email (para a pré-visualização no painel)
router.post('/email-preview', authMiddleware, async (req, res) => {
  try {
    const { body, productIds, productsTitle } = req.body || {};
    const html = await buildMarketingEmailHtml({ body: personalize(await emailBodyWithProducts(body, productIds, productsTitle), 'Ana') });
    res.json({ html });
  } catch (err) {
    console.error('[POST /marketing/email-preview]', err);
    res.status(500).json({ error: 'Erro na pré-visualização' });
  }
});

// POST /api/marketing/send-email — enviar campanha por email
router.post('/send-email', authMiddleware, async (req, res) => {
  try {
    const { subject, recipientIds, sendToAll, attachments, productIds, productsTitle } = req.body;
    const hasProducts = Array.isArray(productIds) && productIds.length > 0;
    if (!subject?.trim() || (!req.body.body?.trim() && !hasProducts))
      return res.status(400).json({ error: 'Assunto e mensagem (ou produtos) são obrigatórios' });
    const body = hasProducts ? await emailBodyWithProducts(req.body.body, productIds, productsTitle) : req.body.body;

    const all = await loadCustomers();
    const ids = new Set(Array.isArray(recipientIds) ? recipientIds.map(String) : []);
    const seen = new Set();
    const recipients = all
      .filter(c => c.email && (sendToAll || ids.has(c.id)))
      .filter(c => { const k = c.email.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

    if (!recipients.length)
      return res.status(400).json({ error: 'Nenhum destinatário com email' });

    const { rows: campaignRows } = await pool.query(
      `INSERT INTO marketing_campaigns (title, subject, body, channel, recipient_count, created_by)
       VALUES ($1, $2, $3, 'email', $4, $5) RETURNING id`,
      [subject, subject, body, recipients.length, req.user.id]
    );

    const BATCH = 10;
    let sent = 0;
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      await Promise.allSettled(batch.map(r => sendMarketingEmail({
        to: r.email,
        subject: personalize(subject, r.name),
        body: personalize(body, r.name),
        attachments: attachments || [],
        unsubscribeToken: randomBytes(16).toString('hex'),
      })));
      sent += batch.length;
    }
    await pool.query(`UPDATE marketing_campaigns SET sent_count = $2, status = 'sent', finished_at = NOW() WHERE id = $1`, [campaignRows[0].id, sent]).catch(() => {});

    res.json({ success: true, sent, campaignId: campaignRows[0].id });
  } catch (err) {
    console.error('[POST /marketing/send-email]', err);
    res.status(500).json({ error: 'Erro ao enviar campanha' });
  }
});

/** Envio em segundo plano, com ritmo humano (o WhatsApp bloqueia números que enviam em rajada). */
async function runWhatsAppCampaign(campaignId, recipients, message, products = []) {
  let sent = 0, failed = 0;
  for (const r of recipients) {
    const text = personalize(message, r.name) + OPT_OUT_FOOTER;
    const result = await sendCustomerWhatsApp(r.whatsapp, text, { event: 'campaign' });
    // Montra: cada produto como foto com legenda, logo a seguir à mensagem
    if (result.ok && products.length) {
      await sendCustomerProductCards(r.whatsapp, products, { event: 'campaign_products', captionFor: productCaption });
    }
    if (result.ok) sent++; else failed++;
    await pool.query('UPDATE marketing_campaigns SET sent_count = $2, failed_count = $3 WHERE id = $1', [campaignId, sent, failed]).catch(() => {});
    if (result.ok) await new Promise(resolve => setTimeout(resolve, 4000 + Math.random() * 5000));
  }
  await pool.query(`UPDATE marketing_campaigns SET status = 'sent', finished_at = NOW() WHERE id = $1`, [campaignId]).catch(() => {});
  console.log(`[marketing] campanha WhatsApp ${campaignId}: ${sent} enviadas, ${failed} falharam`);
}

// POST /api/marketing/whatsapp-send — campanha por WhatsApp (Evolution API); links wa.me se não estiver configurada
router.post('/whatsapp-send', authMiddleware, async (req, res) => {
  try {
    const { message, recipientIds, sendToAll, productIds } = req.body;
    const products = (await getShowcaseProducts(productIds)).slice(0, 4);
    if (!message?.trim()) return res.status(400).json({ error: 'Mensagem obrigatória' });
    if (message.length > 3000) return res.status(400).json({ error: 'Mensagem demasiado longa (máx. 3000 caracteres)' });

    const all = await loadCustomers();
    const ids = new Set(Array.isArray(recipientIds) ? recipientIds.map(String) : []);
    const seen = new Set();
    let skipped = 0;
    const recipients = [];
    for (const c of all) {
      if (!(sendToAll || ids.has(c.id)) || !c.whatsapp) continue;
      if (seen.has(c.whatsapp)) continue;
      seen.add(c.whatsapp);
      if (c.opted_out) { skipped++; continue; }
      recipients.push(c);
    }
    if (!recipients.length) {
      return res.status(400).json({ error: skipped ? 'Todos os destinatários pediram para não receber promoções (SAIR).' : 'Nenhum destinatário com número de telemóvel' });
    }

    if (await isWhatsAppReady()) {
      const { rows } = await pool.query(
        `INSERT INTO marketing_campaigns (title, body, channel, status, recipient_count, skipped_count, created_by)
         VALUES ($1, $2, 'whatsapp', 'sending', $3, $4, $5) RETURNING id`,
        [message.trim().split('\n')[0].slice(0, 80), message, recipients.length, skipped, req.user.id]
      );
      const campaignId = rows[0].id;
      runWhatsAppCampaign(campaignId, recipients, message, products).catch(err => {
        console.error('[marketing] campanha WhatsApp', err);
        pool.query(`UPDATE marketing_campaigns SET status = 'failed', finished_at = NOW() WHERE id = $1`, [campaignId]).catch(() => {});
      });
      // ~6,5 s por mensagem em média, mais ~2,3 s por foto de produto
      return res.json({ mode: 'evolution', campaignId, total: recipients.length, skipped, estimatedSeconds: Math.round(recipients.length * (6.5 + products.length * 2.3)) });
    }

    // Sem Evolution: links wa.me para enviar um a um
    const productLines = products.length ? `\n\n${products.map(p => productCaption(p)).join('\n\n')}` : '';
    const links = recipients.map(r => ({
      name: r.name, phone: r.whatsapp,
      link: `https://wa.me/${r.whatsapp}?text=${encodeURIComponent(personalize(message, r.name) + productLines)}`,
    }));
    await pool.query(
      `INSERT INTO marketing_campaigns (title, body, channel, status, recipient_count, created_by)
       VALUES ($1, $2, 'whatsapp', 'links', $3, $4)`,
      [`Links WhatsApp — ${new Date().toLocaleDateString('pt-MZ')}`, message, links.length, req.user.id]
    );
    res.json({ mode: 'links', links, count: links.length, skipped });
  } catch (err) {
    console.error('[POST /marketing/whatsapp-send]', err);
    res.status(500).json({ error: 'Erro ao enviar WhatsApp' });
  }
});

// GET /api/marketing/campaigns/:id — progresso de uma campanha
router.get('/campaigns/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, channel, status, recipient_count, sent_count, failed_count, skipped_count, finished_at FROM marketing_campaigns WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar campanha' });
  }
});

// GET /api/marketing/campaigns — histórico de campanhas
router.get('/campaigns', authMiddleware, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*, p.name as created_by_name
       FROM marketing_campaigns c
       LEFT JOIN profiles p ON p.id = c.created_by
       ORDER BY c.created_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error('[GET /marketing/campaigns]', err);
    res.status(500).json({ error: 'Erro ao buscar campanhas' });
  }
});

export default router;
