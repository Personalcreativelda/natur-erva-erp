/**
 * Pagamentos M-Pesa "ao comerciante" sem fornecedor de pagamentos.
 *
 * Fluxo:
 *  1. O cliente paga ao código de comerciante (definições: tax_config.mpesa_merchant_code) e
 *     envia no pedido o ID da transação (ou cola a SMS de confirmação que recebeu).
 *  2. O comerciante recebe a SUA SMS de confirmação, com o MESMO ID de transação. Essa SMS chega ao
 *     sistema reencaminhada para o WhatsApp do assistente, ou por uma app de reencaminhamento de
 *     SMS (POST /api/payments/mpesa-sms).
 *  3. Quando os dois IDs coincidem (e o valor chega), o pedido fica Pago automaticamente.
 *     Sem correspondência, a equipa confirma com "CONFIRMAR NE-…" no WhatsApp ou no painel.
 *
 * Tudo passa por confirmOrderPayment(): uma só função, transaccional e idempotente.
 */
import pool from '../db.js';
import { sendPaymentConfirmedEmail, sendPaymentRejectedEmail, sendWhatsAppMessage } from './emailService.js';
import { sendEvolutionMessage } from './assistantService.js';

// ── Esquema (aditivo; aplicado no arranque, como nas restantes rotas) ────────────────────────────
const schemaReady = (async () => {
  const q = (sql) => pool.query(sql).catch(err => console.warn('[payments schema]', err.message));
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS mpesa_transaction_id VARCHAR(40)`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_confirmed_by TEXT`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_rejected_reason TEXT`);
  // Uma transação M-Pesa só pode pagar um pedido
  await q(`CREATE UNIQUE INDEX IF NOT EXISTS orders_mpesa_txid_unique ON orders (mpesa_transaction_id) WHERE mpesa_transaction_id IS NOT NULL`);
  await q(`CREATE TABLE IF NOT EXISTS mpesa_notifications (
    id SERIAL PRIMARY KEY,
    transaction_id VARCHAR(40) UNIQUE NOT NULL,
    amount NUMERIC(12,2),
    payer_phone VARCHAR(20),
    raw_text TEXT NOT NULL,
    received_from TEXT,
    order_id UUID REFERENCES orders(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    matched_at TIMESTAMPTZ
  )`);
})();

// ── Leitura de SMS do M-Pesa ────────────────────────────────────────────────────────────────────
const toAmount = (raw) => {
  let s = String(raw).replace(/\s/g, '');
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // o último separador é o decimal ("1,895.00" ou "1.895,00")
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Extrai ID da transação, valor e telefone de uma SMS de confirmação do M-Pesa (cliente ou comerciante).
 * Tolerante a variações de formato; devolve null nos campos que não encontrar.
 */
export function parseMpesaMessage(text) {
  const t = String(text || '');
  const tx =
    t.match(/ID\s*(?:da\s*)?transa[cç][aã]o\s*[:\-]?\s*([A-Z0-9.]{6,20})/i)?.[1] ||
    t.match(/Confirmad[oa]\.?\s+([A-Z0-9]{8,14})\b/i)?.[1] ||
    // código solto com letras E números (ex.: "CJK7XYZ123") — nunca um telefone
    (t.match(/\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{8,12}\b/) || [])[0] ||
    null;
  const amountRaw = t.match(/(\d[\d.,\s]*\d|\d)\s*MT/i)?.[1];
  const phone = t.match(/(?:\+?258)?\s?(8[2-7]\d{7})\b/)?.[1] || null;
  return {
    transactionId: tx ? tx.replace(/\./g, '').toUpperCase() : null,
    amount: amountRaw ? toAmount(amountRaw) : null,
    phone,
  };
}

/** Normaliza um ID de transação escrito pelo cliente (maiúsculas, sem espaços/pontos). */
export const normalizeTxId = (s) => (s ? String(s).replace(/[\s.]/g, '').toUpperCase() : null);

// ── Contactos ───────────────────────────────────────────────────────────────────────────────────
const realPhone = (p) => (p && !/^(no_phone_|np_)/i.test(p) ? p : null);

async function getCustomerContact(order) {
  let email = null, name = order.customer_name, phone = realPhone(order.customer_phone);
  const lookups = [];
  if (order.created_by) lookups.push(['SELECT email, name, phone FROM profiles WHERE id = $1', order.created_by]);
  if (order.customer_id) lookups.push(['SELECT email, name, phone FROM profiles WHERE customer_id = $1 LIMIT 1', order.customer_id]);
  for (const [sql, arg] of lookups) {
    const { rows } = await pool.query(sql, [arg]).catch(() => ({ rows: [] }));
    if (rows[0]) {
      email = email || rows[0].email;
      name = name || rows[0].name;
      phone = phone || realPhone(rows[0].phone);
    }
  }
  return { email, name, phone };
}

/** Aviso à equipa pelo WhatsApp do assistente (números autorizados). Best-effort. */
export async function notifyStaff(text) {
  try {
    const { rows } = await pool.query('SELECT * FROM assistant_config WHERE id = 1');
    const config = rows[0];
    if (!config?.is_enabled || !config.authorized_numbers?.length) return;
    await Promise.all(config.authorized_numbers.map(n => sendEvolutionMessage(config, n, text).catch(() => {})));
  } catch (err) {
    console.warn('[payments] aviso à equipa falhou:', err.message);
  }
}

const fmtMT = (n) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

// ── Confirmar / rejeitar ────────────────────────────────────────────────────────────────────────
/**
 * Marca o pedido como pago. Idempotente: se já estiver pago devolve { alreadyPaid: true } sem notificar.
 * @param confirmedBy  ex.: id do utilizador, "whatsapp:2588…", "auto:mpesa-sms"
 */
export async function confirmOrderPayment({ orderId, confirmedBy, transactionId = null }) {
  await schemaReady;
  const client = await pool.connect();
  let order;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (!rows.length) { await client.query('ROLLBACK'); return { ok: false, error: 'Pedido não encontrado' }; }
    if (rows[0].payment_status === 'paid') { await client.query('ROLLBACK'); return { ok: true, alreadyPaid: true, order: rows[0] }; }
    if (rows[0].status === 'cancelled') { await client.query('ROLLBACK'); return { ok: false, error: 'O pedido está cancelado' }; }

    const upd = await client.query(
      `UPDATE orders SET
         payment_status = 'paid',
         amount_paid = total_amount,
         payment_method = COALESCE(payment_method, 'mpesa'),
         mpesa_transaction_id = COALESCE($2, mpesa_transaction_id),
         payment_confirmed_at = NOW(),
         payment_confirmed_by = $3,
         payment_rejected_reason = NULL,
         status = CASE WHEN status = 'pending' THEN 'confirmed' ELSE status END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [orderId, normalizeTxId(transactionId), String(confirmedBy || 'equipa')]
    );
    await client.query('COMMIT');
    order = upd.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return { ok: false, error: 'Esta transação M-Pesa já foi usada noutro pedido' };
    throw err;
  } finally {
    client.release();
  }

  // Notificações (fora da transacção; não bloqueiam a confirmação)
  const contact = await getCustomerContact(order);
  if (contact.email) {
    sendPaymentConfirmedEmail({ to: contact.email, name: contact.name, orderNumber: order.order_number, totalAmount: order.total_amount, transactionId: order.mpesa_transaction_id }).catch(() => {});
  }
  if (contact.phone) {
    sendWhatsAppMessage({ phone: contact.phone, message: `✅ Natur Erva: o pagamento do pedido #${order.order_number} (${fmtMT(order.total_amount)}) foi confirmado. Já estamos a preparar a sua encomenda.` }).catch(() => {});
  }
  return { ok: true, order };
}

export async function rejectOrderPayment({ orderId, reason, rejectedBy }) {
  await schemaReady;
  const { rows } = await pool.query(
    `UPDATE orders SET payment_rejected_reason = $2, payment_submitted_at = NULL, mpesa_transaction_id = NULL, updated_at = NOW()
     WHERE id = $1 AND payment_status <> 'paid' RETURNING *`,
    [orderId, reason || 'Pagamento não encontrado']
  );
  if (!rows.length) return { ok: false, error: 'Pedido não encontrado ou já pago' };
  const order = rows[0];
  console.log(`[payments] pagamento rejeitado #${order.order_number} por ${rejectedBy}: ${reason || ''}`);
  const contact = await getCustomerContact(order);
  if (contact.email) sendPaymentRejectedEmail({ to: contact.email, name: contact.name, orderNumber: order.order_number, reason: order.payment_rejected_reason }).catch(() => {});
  return { ok: true, order };
}

// ── Correspondência automática ──────────────────────────────────────────────────────────────────
/** Se existir SMS do comerciante com este ID e o valor chegar, confirma o pedido. */
async function tryMatch(order) {
  if (!order?.mpesa_transaction_id || order.payment_status === 'paid') return null;
  const { rows } = await pool.query(
    'SELECT * FROM mpesa_notifications WHERE transaction_id = $1 AND order_id IS NULL',
    [order.mpesa_transaction_id]
  );
  const sms = rows[0];
  if (!sms) return null;
  if (sms.amount != null && Number(sms.amount) + 0.01 < Number(order.total_amount)) {
    notifyStaff(`⚠️ Pagamento abaixo do total no pedido #${order.order_number}: recebido ${fmtMT(sms.amount)}, total ${fmtMT(order.total_amount)} (transação ${sms.transaction_id}). Confirme manualmente se estiver correcto.`);
    return null;
  }
  const result = await confirmOrderPayment({ orderId: order.id, confirmedBy: 'auto:mpesa-sms', transactionId: sms.transaction_id });
  if (result.ok && !result.alreadyPaid) {
    await pool.query('UPDATE mpesa_notifications SET order_id = $1, matched_at = NOW() WHERE id = $2', [order.id, sms.id]);
    notifyStaff(`✅ Pago automaticamente: pedido #${order.order_number} · ${fmtMT(order.total_amount)} · transação ${sms.transaction_id}`);
  }
  return result;
}

/**
 * Cliente envia o comprovativo: ID da transação e/ou o texto da SMS que recebeu.
 * Tenta confirmar logo (se a SMS do comerciante já tiver chegado); senão avisa a equipa.
 */
export async function submitPaymentProof({ orderId, user, transactionId, proofText }) {
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = rows[0];
  if (!order) return { ok: false, status: 404, error: 'Pedido não encontrado' };

  // Dono: criou o pedido, ou o pedido é do cliente associado ao seu perfil (o token não traz customer_id)
  let isOwner = !!user && order.created_by === user.id;
  if (!isOwner && user?.id && order.customer_id) {
    const { rows: p } = await pool.query('SELECT 1 FROM profiles WHERE id = $1 AND customer_id = $2', [user.id, order.customer_id]);
    isOwner = p.length > 0;
  }
  const roles = (Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role]).map(r => String(r || '').toUpperCase());
  const isStaff = user?.isSuperAdmin || roles.some(r => r && r !== 'CLIENTE');
  if (!isOwner && !isStaff) return { ok: false, status: 403, error: 'Sem permissão para este pedido' };
  if (order.payment_status === 'paid') return { ok: true, alreadyPaid: true };

  const parsed = parseMpesaMessage(proofText);
  const txId = normalizeTxId(transactionId) || parsed.transactionId;
  if (!txId) return { ok: false, status: 400, error: 'Indique o código da transação que vem na SMS do M-Pesa.' };

  try {
    const upd = await pool.query(
      `UPDATE orders SET mpesa_transaction_id = $2, payment_proof_text = COALESCE($3, payment_proof_text),
         payment_method = 'mpesa', payment_submitted_at = NOW(), payment_rejected_reason = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [orderId, txId, proofText ? String(proofText).slice(0, 2000) : null]
    );
    const updated = upd.rows[0];
    const matched = await tryMatch(updated);
    if (matched?.ok) return { ok: true, paid: true, order: matched.order };

    notifyStaff(
      `💰 Pagamento a confirmar\nPedido #${updated.order_number} · ${fmtMT(updated.total_amount)}\nCliente: ${updated.customer_name}\nTransação M-Pesa: ${txId}\n\nResponda:\nCONFIRMAR ${updated.order_number}\nou REJEITAR ${updated.order_number} motivo`
    );
    return { ok: true, paid: false, order: updated };
  } catch (err) {
    if (err.code === '23505') return { ok: false, status: 409, error: 'Este código de transação já foi usado noutro pedido.' };
    throw err;
  }
}

/**
 * SMS de confirmação recebida pelo COMERCIANTE (reencaminhada pelo WhatsApp da equipa ou por uma
 * app de reencaminhamento de SMS). Regista-a e tenta pagar o pedido com o mesmo ID de transação.
 */
export async function recordMerchantSms({ text, receivedFrom }) {
  await schemaReady;
  const parsed = parseMpesaMessage(text);
  if (!parsed.transactionId) return { ok: false, error: 'Não encontrei o ID da transação nesta mensagem.' };

  await pool.query(
    `INSERT INTO mpesa_notifications (transaction_id, amount, payer_phone, raw_text, received_from)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (transaction_id) DO NOTHING`,
    [parsed.transactionId, parsed.amount, parsed.phone, String(text).slice(0, 2000), receivedFrom || null]
  );
  const { rows } = await pool.query(
    `SELECT * FROM orders WHERE mpesa_transaction_id = $1 AND payment_status <> 'paid' LIMIT 1`,
    [parsed.transactionId]
  );
  if (!rows.length) return { ok: true, matched: false, ...parsed };
  const result = await tryMatch(rows[0]);
  return { ok: true, matched: !!result?.ok, orderNumber: rows[0].order_number, ...parsed };
}

/**
 * Mensagens da equipa no WhatsApp do assistente (números autorizados), tratadas ANTES da IA:
 *   "CONFIRMAR NE-…"            → marca como pago
 *   "REJEITAR NE-… motivo"      → rejeita o comprovativo e avisa o cliente
 *   SMS do M-Pesa reencaminhada → regista e paga o pedido com o mesmo ID de transação
 * Comandos de texto fixo (não interpretados por IA) porque mexem em dinheiro.
 * @returns true se a mensagem foi tratada aqui
 */
export async function handleStaffPaymentMessage(config, phone, text) {
  const reply = (msg) => sendEvolutionMessage(config, phone, msg).catch(() => {});
  const t = String(text || '').trim();

  let m = t.match(/^(?:confirmar|pago)\s+#?([A-Z0-9][A-Z0-9-]{3,})\s*$/i);
  if (m) {
    const order = await findOrderByNumber(m[1]);
    if (!order) { await reply(`Não encontrei o pedido ${m[1]}.`); return true; }
    const r = await confirmOrderPayment({ orderId: order.id, confirmedBy: `whatsapp:${phone}` });
    await reply(!r.ok ? `❌ ${r.error}`
      : r.alreadyPaid ? `O pedido #${order.order_number} já estava pago.`
      : `✅ Pedido #${order.order_number} marcado como pago. O cliente foi avisado por email.`);
    return true;
  }

  m = t.match(/^rejeitar\s+#?([A-Z0-9][A-Z0-9-]{3,})\s*(.*)$/is);
  if (m) {
    const order = await findOrderByNumber(m[1]);
    if (!order) { await reply(`Não encontrei o pedido ${m[1]}.`); return true; }
    const r = await rejectOrderPayment({ orderId: order.id, reason: m[2]?.trim() || null, rejectedBy: `whatsapp:${phone}` });
    await reply(r.ok ? `Pagamento do pedido #${order.order_number} rejeitado. O cliente foi avisado para reenviar.` : `❌ ${r.error}`);
    return true;
  }

  // SMS de confirmação do M-Pesa reencaminhada pela equipa
  if (/confirmad[oa]|recebeste|transa[cç][aã]o|m-?pesa/i.test(t) && /MT/i.test(t)) {
    const parsed = parseMpesaMessage(t);
    if (!parsed.transactionId) return false;
    const r = await recordMerchantSms({ text: t, receivedFrom: `whatsapp:${phone}` });
    await reply(r.matched
      ? `✅ Transação ${parsed.transactionId} associada ao pedido #${r.orderNumber} — marcado como pago.`
      : `📥 Transação ${parsed.transactionId}${parsed.amount ? ` (${fmtMT(parsed.amount)})` : ''} registada. Fica paga automaticamente quando o cliente enviar este código no pedido.`);
    return true;
  }
  return false;
}

/** Procura um pedido pelo número (ex.: "NE-20261113-AB12") — usado pelos comandos de WhatsApp. */
export async function findOrderByNumber(orderNumber) {
  const { rows } = await pool.query(
    'SELECT * FROM orders WHERE UPPER(order_number) = UPPER($1) OR UPPER(tracking_code) = UPPER($1) LIMIT 1',
    [String(orderNumber || '').trim().replace(/^#/, '')]
  );
  return rows[0] || null;
}
