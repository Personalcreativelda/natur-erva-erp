import express from 'express';
import { recordMerchantSms } from '../services/paymentService.js';

const router = express.Router();

/**
 * /api/payments/mpesa-sms/:secret  (GET ou POST)
 * Recebe as SMS de confirmação do M-Pesa / e-Mola que chegam ao telemóvel do COMERCIANTE, enviadas
 * por uma app de reencaminhamento de SMS (ex.: "SMS Forwarder" no Android).
 *
 *  GET  (o mais comum nestas apps — a mensagem vai no URL):
 *       https://<api>/api/payments/mpesa-sms/<MPESA_SMS_SECRET>?text={msg}&from={from}
 *  POST JSON: { "text": "<texto da SMS>", "from": "<remetente>" }
 *
 * Aceita vários nomes de campo (text/msg/message/body/content e from/sender/phone/number) para
 * funcionar com apps diferentes. O segredo vai no caminho para apps que não deixam definir cabeçalhos.
 */
const pick = (obj, keys) => {
  for (const k of keys) if (obj && obj[k] != null && String(obj[k]).trim() !== '') return String(obj[k]);
  return '';
};

async function handleSms(req, res) {
  const expected = process.env.MPESA_SMS_SECRET;
  if (!expected || req.params.secret !== expected) return res.status(401).json({ error: 'Segredo inválido' });

  const src = { ...(req.query || {}), ...(typeof req.body === 'object' ? req.body : {}) };
  const text = pick(src, ['text', 'msg', 'message', 'body', 'content', 'sms']);
  const from = pick(src, ['from', 'sender', 'phone', 'number', 'address']);
  if (!text) return res.status(400).json({ error: 'Mensagem vazia — envie o texto da SMS em "text" ou "msg"' });

  // Só SMS do M-Pesa / e-Mola: evita que outra mensagem no mesmo telemóvel seja tomada como pagamento
  if (from && !/m-?pesa|vodacom|e-?mola|movitel|^\d{3,6}$/i.test(from)) {
    return res.json({ ok: true, ignored: 'remetente não é o M-Pesa nem o e-Mola' });
  }

  try {
    const result = await recordMerchantSms({ text, receivedFrom: `sms:${from || 'desconhecido'}` });
    // 200 mesmo sem código de transação (ex.: mensagem de teste da app), para a app não repetir o envio
    res.json(result);
  } catch (err) {
    console.error('[payments/mpesa-sms]', err);
    res.status(500).json({ error: 'Erro ao processar a SMS' });
  }
}

router.get('/mpesa-sms/:secret', handleSms);
router.post('/mpesa-sms/:secret', handleSms);

export default router;
