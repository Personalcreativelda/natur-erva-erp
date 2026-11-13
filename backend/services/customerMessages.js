/**
 * Textos de WhatsApp enviados aos clientes (formatação do WhatsApp: *negrito*, _itálico_).
 * Usados por notificationService através de routes/orders.js e services/paymentService.js.
 */
const appUrl = () => (process.env.APP_URL || process.env.FRONTEND_URL || 'https://www.natur-erva.co.mz').replace(/\/$/, '');

const fmtMT = (n) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
// "INACIO SILVA" → "Inacio" (muitos nomes estão gravados em maiúsculas)
const firstName = (name) => {
  const first = String(name || 'cliente').trim().split(/\s+/)[0] || 'cliente';
  return first.charAt(0).toLocaleUpperCase('pt') + first.slice(1).toLocaleLowerCase('pt');
};

/** Link para acompanhar: rastreio público (sem login) quando há código, senão a área do cliente. */
const trackLink = (order) => (order?.tracking_code
  ? `${appUrl()}/rastrear-encomenda?codigo=${encodeURIComponent(order.tracking_code)}`
  : `${appUrl()}/minha-conta/encomendas`);

export function buildOrderCreatedWhatsApp(order, name) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = items.slice(0, 12).map(i => {
    const qty = Number(i.quantity || 1);
    const label = [i.productName || i.name || 'Produto', i.variantName || i.variant].filter(Boolean).join(' – ');
    return `• ${qty}× ${label}`;
  });
  if (items.length > 12) lines.push(`• … e mais ${items.length - 12} artigo(s)`);

  const delivery = order?.is_delivery
    ? `🚚 Entrega${order.delivery_zone_name ? ` (${order.delivery_zone_name})` : ''}${Number(order.delivery_fee) > 0 ? `: ${fmtMT(order.delivery_fee)}` : ''}`
    : '🏪 Levantamento na loja';
  const unpaid = order?.payment_status !== 'paid';

  return [
    `Olá *${firstName(name)}*! 🌿`,
    '',
    `Recebemos o seu pedido *#${order?.order_number}*. Obrigado pela preferência!`,
    '',
    ...lines,
    '',
    delivery,
    `💰 *Total: ${fmtMT(order?.total_amount)}*`,
    ...(unpaid ? ['', 'Se ainda não pagou, pode pagar por M-Pesa ou e-Mola na página do pedido e enviar o código da transação.'] : []),
    '',
    `Acompanhe aqui: ${trackLink(order)}`,
    '',
    '🌿 *Natur Erva*',
  ].join('\n');
}

export function buildStatusWhatsApp(order, name, status) {
  const n = firstName(name);
  const num = order?.order_number;
  const link = trackLink(order);
  const messages = {
    confirmed:
      `Olá *${n}*! 🎉\n\nO seu pedido *#${num}* foi confirmado.\n\nEstamos já a preparar os seus produtos. Obrigado pela confiança!\n\n🌿 *Natur Erva*`,
    processing:
      `Olá *${n}*! 📦\n\nO seu pedido *#${num}* está em preparação — estamos a embalar os seus produtos com todo o cuidado.\n\nEm breve sairá para entrega!\n\n🌿 *Natur Erva*`,
    out_for_delivery:
      `Olá *${n}*! 🚚\n\nO seu pedido *#${num}* saiu para entrega e está a caminho.\n\nEsteja disponível para o receber.\n\nAcompanhe aqui: ${link}\n\n🌿 *Natur Erva*`,
    delivered:
      `Olá *${n}*! 🎉\n\nO seu pedido *#${num}* foi entregue!\n\nEsperamos que goste dos produtos. Confirme a receção e deixe a sua avaliação na sua conta:\n👉 ${appUrl()}/minha-conta\n\nObrigado por escolher a Natur Erva! 🌿`,
    completed:
      `Olá *${n}*! ✅\n\nO seu pedido *#${num}* foi concluído.\n\nObrigado pela preferência! Conte-nos o que achou dos produtos:\n👉 ${appUrl()}/minha-conta\n\n🌿 *Natur Erva*`,
    cancelled:
      `Olá *${n}*. ℹ️\n\nO seu pedido *#${num}* foi cancelado.\n\nSe tiver alguma dúvida ou quiser fazer um novo pedido, estamos disponíveis para ajudar.\n\n🌿 *Natur Erva* — ${appUrl()}`,
  };
  return messages[status]
    || `Olá *${n}*! O seu pedido *#${num}* foi actualizado.\n\nAcompanhe aqui: ${link}\n\n🌿 *Natur Erva*`;
}

export function buildPaymentConfirmedWhatsApp(order, name, methodLabel = 'M-Pesa') {
  return `Olá *${firstName(name)}*! ✅\n\nRecebemos o seu pagamento ${methodLabel} de *${fmtMT(order?.total_amount)}* para o pedido *#${order?.order_number}*${order?.mpesa_transaction_id ? ` (transação ${order.mpesa_transaction_id})` : ''}.\n\nJá estamos a preparar a sua encomenda.\n\nAcompanhe aqui: ${trackLink(order)}\n\n🌿 *Natur Erva*`;
}

export function buildPaymentRejectedWhatsApp(order, name, reason) {
  return `Olá *${firstName(name)}*. ⚠️\n\nNão conseguimos confirmar o pagamento do pedido *#${order?.order_number}*${reason ? `: ${reason}` : '.'}\n\nVerifique o código da transação e envie-o novamente na página do pedido:\n👉 ${appUrl()}/minha-conta/encomendas/${order?.id}\n\n🌿 *Natur Erva*`;
}
