import express from 'express';
import { recordMerchantSms } from '../services/paymentService.js';

const router = express.Router();

/**
 * POST /api/payments/mpesa-sms/:secret
 * Recebe as SMS de confirmação do M-Pesa que chegam ao telemóvel do COMERCIANTE, enviadas por uma
 * app de reencaminhamento de SMS (ex.: "SMS Forwarder" no Android) configurada para:
 *   URL:   https://<backend>/api/payments/mpesa-sms/<MPESA_SMS_SECRET>
 *   Corpo: JSON { "text": "<texto da SMS>", "from": "<remetente>" }   (também aceita "message"/"body")
 * O segredo vai no caminho para funcionar com apps que não deixam definir cabeçalhos.
 */
router.post('/mpesa-sms/:secret', async (req, res) => {
  const expected = process.env.MPESA_SMS_SECRET;
  if (!expected || req.params.secret !== expected) return res.status(401).json({ error: 'Segredo inválido' });

  const body = req.body || {};
  const text = body.text || body.message || body.body || body.msg || '';
  const from = String(body.from || body.sender || '');
  if (!text) return res.status(400).json({ error: 'Mensagem vazia' });

  // Só SMS do M-Pesa: evita que outra mensagem no mesmo telemóvel seja tomada como pagamento
  if (from && !/m-?pesa|vodacom|^\d{3,6}$/i.test(from)) return res.json({ ok: true, ignored: 'remetente não é o M-Pesa' });

  try {
    const result = await recordMerchantSms({ text, receivedFrom: `sms:${from || 'desconhecido'}` });
    res.json(result);
  } catch (err) {
    console.error('[POST /payments/mpesa-sms]', err);
    res.status(500).json({ error: 'Erro ao processar a SMS' });
  }
});

export default router;
