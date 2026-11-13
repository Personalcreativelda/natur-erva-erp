import { Resend } from 'resend';
import pool from '../db.js';

// Lazy — evita crash no arranque ESM antes do dotenv carregar
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith('re_your')) return null;
  _resend = new Resend(key);
  return _resend;
}

const FROM = process.env.RESEND_FROM_EMAIL || 'Natur Erva <noreply@natur-erva.co.mz>';
const APP_URL = (process.env.APP_URL || 'https://www.natur-erva.co.mz').replace(/\/$/, '');
const APP_NAME = 'Natur Erva';

// ─── Logótipo ─────────────────────────────────────────────────────────────────
// O mesmo do painel (Finanças → logótipo da empresa); sem logótipo, o logo.png do site.
const LOGO_PLACEHOLDER = '{{LOGO_URL}}';
let logoCache = { url: null, at: 0 };
async function getLogoUrl() {
  if (logoCache.url && Date.now() - logoCache.at < 10 * 60 * 1000) return logoCache.url;
  let url = `${APP_URL}/logo.png`;
  try {
    const { rows } = await pool.query('SELECT logo_url FROM tax_config WHERE id = 1');
    if (rows[0]?.logo_url && /^https?:\/\//.test(rows[0].logo_url)) url = rows[0].logo_url;
  } catch { /* usa o logo do site */ }
  logoCache = { url, at: Date.now() };
  return url;
}

// ─── Linhas de dados (tabela: funciona no Gmail/Outlook, onde o flex é ignorado) ─
const row = (label, value, valueStyle = '') =>
  `<tr><td class="label" style="padding:9px 0;border-bottom:1px solid #dcfce7;color:#6b7280;font-size:14px;vertical-align:top">${label}</td>` +
  `<td class="value" style="padding:9px 0 9px 16px;border-bottom:1px solid #dcfce7;text-align:right;font-weight:600;color:#111;font-size:14px;vertical-align:top;${valueStyle}">${value}</td></tr>`;
const box = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="box" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;margin:16px 0;padding:6px 18px;border-collapse:separate">${rows}</table>`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── base HTML wrapper ────────────────────────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${APP_NAME}</title>
<style>
  body{margin:0;padding:0;background:#f4f7f4;font-family:'Segoe UI',Arial,sans-serif;color:#222}
  .wrap{max-width:580px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)}
  .header{background:#ffffff;padding:24px 24px 18px;text-align:center;border-bottom:4px solid #16a34a}
  .header img{display:inline-block;height:56px;width:auto;border:0}
  .header p{margin:8px 0 0;color:#15803d;font-size:13px}
  .body{padding:32px 28px}
  .body h2{font-size:20px;font-weight:700;color:#15803d;margin:0 0 12px}
  .body p{margin:0 0 12px;font-size:15px;line-height:1.6;color:#444}
  .btn{display:inline-block;margin:16px 0;padding:14px 32px;background:#16a34a;color:#fff!important;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600}
  .box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 20px;margin:16px 0}
  .box-item{display:flex;justify-content:space-between;padding:6px 0;font-size:14px;border-bottom:1px solid #dcfce7}
  .box-item:last-child{border:none}
  .label{color:#6b7280}
  .value{font-weight:600;color:#111}
  .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600}
  .footer{background:#f9fafb;padding:20px 28px;text-align:center;border-top:1px solid #e5e7eb}
  .footer p{margin:0;font-size:12px;color:#9ca3af;line-height:1.6}
  .footer a{color:#16a34a;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <a href="${APP_URL}"><img src="${LOGO_PLACEHOLDER}" alt="${APP_NAME}" height="56"></a>
    <p>Saúde natural, entregue à sua porta</p>
  </div>
  <div class="body">${content}</div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} ${APP_NAME} · Moçambique<br>
    <a href="${APP_URL}">${APP_URL}</a><br>
    Recebeu este email porque tem uma conta em ${APP_NAME}.</p>
  </div>
</div>
</body></html>`;
}

function statusColor(status) {
  const map = {
    pending: '#f59e0b', processing: '#3b82f6', confirmed: '#8b5cf6',
    out_for_delivery: '#f97316', delivered: '#16a34a', completed: '#15803d',
    cancelled: '#ef4444'
  };
  return map[status] || '#6b7280';
}

function statusLabel(status) {
  const map = {
    pending: 'Pendente', processing: 'Em Processamento', confirmed: 'Confirmado',
    out_for_delivery: 'A Caminho', delivered: 'Entregue',
    completed: 'Concluído', cancelled: 'Cancelado'
  };
  return map[status] || status;
}

async function send(to, subject, html) {
  const client = getResend();
  if (!client) {
    console.warn('[Email] RESEND_API_KEY não configurado — email não enviado:', subject);
    return;
  }
  try {
    html = html.split(LOGO_PLACEHOLDER).join(await getLogoUrl());
    await client.emails.send({ from: FROM, to, subject, html });
    console.log(`[Email] Enviado: "${subject}" → ${to}`);
  } catch (err) {
    console.error('[Email] Erro ao enviar:', err.message);
  }
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function sendWelcomeEmail({ name, email }) {
  const html = baseTemplate(`
    <h2>Bem-vindo(a), ${name}! 🎉</h2>
    <p>A sua conta na <strong>${APP_NAME}</strong> foi criada com sucesso. Estamos muito felizes em tê-lo(a) connosco!</p>
    <p>Explore os nossos produtos naturais e comece a sua jornada para uma vida mais saudável.</p>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/loja">Ver Produtos</a>
    </div>
    ${box(row('Email', esc(email)) + row('Programa de Fidelidade', '1 ponto por cada 10 MT gasto'))}
    <p style="font-size:13px;color:#6b7280">Se não criou esta conta, pode ignorar este email.</p>
  `);
  await send(email, `Bem-vindo(a) ao ${APP_NAME}!`, html);
}

export async function sendOrderConfirmationEmail({ to, name, orderNumber, items, totalAmount, isDelivery, deliveryLocation }) {
  // Os itens do pedido guardam o nome em productName (não "name") e o preço em price/priceAtTime
  const itemsHtml = (items || []).map(i => {
    const itemName = i.productName || i.name || i.product_name || 'Produto';
    const qty = Number(i.quantity) || 1;
    const unit = Number(i.price ?? i.priceAtTime ?? i.unit_price ?? 0);
    return row(`${esc(itemName)} × ${qty}`, mt(unit * qty));
  }).join('');

  const html = baseTemplate(`
    <h2>Pedido Confirmado! ✅</h2>
    <p>Olá <strong>${esc(name)}</strong>, recebemos o seu pedido e estamos a processá-lo.</p>
    ${box(
      row('Nº Pedido', `#${esc(orderNumber)}`) +
      itemsHtml +
      row('Entrega', isDelivery ? esc(deliveryLocation || 'Com entrega') : 'Levantamento') +
      row('<strong style="color:#111">Total</strong>', mt(totalAmount), 'color:#16a34a;font-size:16px')
    )}
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/minha-conta/encomendas">Acompanhar Pedido</a>
    </div>
    <p>Entraremos em contacto em breve para confirmar os detalhes da entrega. Obrigado por escolher a ${APP_NAME}!</p>
  `);
  await send(to, `Pedido #${orderNumber} confirmado — ${APP_NAME}`, html);
}

const mt = (n) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

/** Pagamento móvel (M-Pesa / e-Mola) confirmado (pela equipa ou por correspondência automática da SMS do comerciante). */
export async function sendPaymentConfirmedEmail({ to, name, orderNumber, totalAmount, transactionId, methodLabel = 'M-Pesa' }) {
  const html = baseTemplate(`
    <h2>Pagamento confirmado ✅</h2>
    <p>Olá <strong>${name || 'cliente'}</strong>, confirmámos o pagamento do seu pedido. Já estamos a prepará-lo.</p>
    ${box(
      row('Nº Pedido', `#${esc(orderNumber)}`) +
      row('Valor pago', mt(totalAmount), 'color:#16a34a') +
      (transactionId ? row(`Transação ${esc(methodLabel)}`, esc(transactionId)) : '')
    )}
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/minha-conta/encomendas">Acompanhar pedido</a>
    </div>
    <p>Obrigado por escolher a ${APP_NAME}!</p>
  `);
  await send(to, `Pagamento confirmado — Pedido #${orderNumber}`, html);
}

/** Comprovativo não aceite — o cliente pode reenviar. */
export async function sendPaymentRejectedEmail({ to, name, orderNumber, reason }) {
  const html = baseTemplate(`
    <h2>Não conseguimos confirmar o pagamento</h2>
    <p>Olá <strong>${name || 'cliente'}</strong>, não foi possível confirmar o pagamento do pedido <strong>#${orderNumber}</strong>.</p>
    ${reason ? box(row('Motivo', esc(reason))) : ''}
    <p>Verifique o código da transação na SMS de confirmação e envie-o novamente na página do pedido, ou contacte-nos.</p>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/minha-conta/encomendas">Ver pedido</a>
    </div>
  `);
  await send(to, `Pagamento por confirmar — Pedido #${orderNumber}`, html);
}

export async function sendOrderStatusEmail({ to, name, orderNumber, status }) {
  const color = statusColor(status);
  const label = statusLabel(status);

  const messages = {
    processing: 'O seu pedido está a ser processado pela nossa equipa.',
    confirmed: 'O seu pedido foi confirmado e será preparado em breve.',
    out_for_delivery: '🚚 O seu pedido saiu para entrega! Esteja disponível para o receber.',
    delivered: '🎉 O seu pedido foi entregue! Esperamos que goste dos produtos.',
    completed: '✅ Pedido concluído. Obrigado pela sua preferência!',
    cancelled: 'O seu pedido foi cancelado. Se tiver questões, contacte-nos.',
  };

  const html = baseTemplate(`
    <h2>Atualização do Pedido #${orderNumber}</h2>
    <p>Olá <strong>${name}</strong>, temos uma atualização sobre o seu pedido.</p>
    <div style="text-align:center;margin:20px 0">
      <span class="status-badge" style="background:${color}22;color:${color};border:1px solid ${color}44">
        ${label}
      </span>
    </div>
    <p>${messages[status] || `Estado atual: ${label}`}</p>
    <div style="text-align:center">
      <a class="btn" href="${APP_URL}/minha-conta/encomendas">Ver Pedido</a>
    </div>
  `);
  await send(to, `Pedido #${orderNumber} — ${label}`, html);
}

export async function sendPasswordResetEmail({ to, name, resetToken }) {
  const link = `${APP_URL}/reset-password?token=${resetToken}`;
  const html = baseTemplate(`
    <h2>Recuperação de Senha</h2>
    <p>Olá <strong>${name || 'utilizador'}</strong>, recebemos um pedido para redefinir a sua senha.</p>
    <p>Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.</p>
    <div style="text-align:center">
      <a class="btn" href="${link}">Redefinir Senha</a>
    </div>
    <p style="font-size:13px;color:#6b7280">Se não pediu a recuperação de senha, pode ignorar este email — a sua senha não será alterada.</p>
    <p style="font-size:12px;color:#9ca3af;word-break:break-all">Ou copie este link: ${link}</p>
  `);
  await send(to, `Recuperação de senha — ${APP_NAME}`, html);
}

export async function sendMarketingEmail({ to, subject, body, unsubscribeToken, attachments }) {
  const footer = unsubscribeToken
    ? `<p style="font-size:11px;color:#9ca3af;margin-top:8px">
        <a href="${APP_URL}/unsubscribe?token=${unsubscribeToken}" style="color:#9ca3af">Cancelar subscrição</a>
       </p>`
    : '';
  const html = baseTemplate(`${body}${footer}`);

  const client = getResend();
  if (!client) {
    console.warn('[Email] RESEND_API_KEY não configurado — email não enviado:', subject);
    return;
  }
  try {
    const payload = { from: FROM, to, subject, html };
    if (attachments?.length) {
      payload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content
      }));
    }
    await client.emails.send(payload);
    console.log(`[Email] Enviado: "${subject}" → ${to}`);
  } catch (err) {
    console.error('[Email] Erro ao enviar:', err.message);
  }
}

// ─── WhatsApp Business API ────────────────────────────────────────────────────

export async function sendWhatsAppMessage({ phone, message }) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    console.warn('[WhatsApp] Credenciais não configuradas');
    return { ok: false, error: 'WhatsApp Business API não configurado' };
  }

  // Normalizar número: garantir prefixo 258 (Moçambique)
  const cleaned = phone.replace(/\D/g, '');
  const fullPhone = cleaned.startsWith('258') ? cleaned : `258${cleaned}`;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: fullPhone,
          type: 'text',
          text: { body: message }
        })
      }
    );
    const data = await res.json();
    if (!res.ok) {
      console.error('[WhatsApp] API error:', JSON.stringify(data));
      return { ok: false, error: data?.error?.message || 'Erro na API do WhatsApp' };
    }
    console.log(`[WhatsApp] Enviado → ${fullPhone}`);
    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    console.error('[WhatsApp] Erro:', err.message);
    return { ok: false, error: err.message };
  }
}
