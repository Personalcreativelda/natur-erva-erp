import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, Loader2, Smartphone, XCircle } from 'lucide-react';
import api from '../../core/services/apiClient';
import { getSystemSettings } from '../../core/services/systemSettingsService';
import { formatMoney } from '../../core/utils/money';

/**
 * Pagamento M-Pesa ao comerciante, sem fornecedor de pagamentos.
 * O cliente paga ao código de comerciante e envia o código da transação (ou cola a SMS).
 * O backend confirma sozinho quando a SMS do comerciante tiver o mesmo código; senão a equipa
 * confirma pelo WhatsApp/painel. Ver backend/services/paymentService.js.
 */
export interface MpesaPaymentState {
  paymentStatus?: string;
  mpesaTransactionId?: string | null;
  paymentSubmittedAt?: string | null;
  paymentRejectedReason?: string | null;
}

interface Props extends MpesaPaymentState {
  orderId: string;
  orderNumber?: string;
  total: number;
  onChange?: (state: MpesaPaymentState) => void;
}

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* sem clipboard */ } }}
      className="tap-target w-9 h-9 !min-h-0 flex items-center justify-center rounded-lg text-content-muted hover:bg-surface-overlay"
      aria-label={label}
    >
      {done ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
    </button>
  );
};

export const MpesaPaymentPanel: React.FC<Props> = ({ orderId, orderNumber, total, onChange, ...initial }) => {
  const [merchant, setMerchant] = useState<{ code: string; name: string } | null>(null);
  const [state, setState] = useState<MpesaPaymentState>(initial);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSystemSettings().then(s => {
      const code = String(s.mpesa_merchant_code || '').trim();
      setMerchant(code ? { code, name: String(s.mpesa_merchant_name || '') } : null);
    }).catch(() => setMerchant(null));
  }, []);

  if (!merchant) return null;

  const paid = state.paymentStatus === 'paid';
  const awaiting = !paid && !!state.paymentSubmittedAt;
  const amount = formatMoney(total);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) { setError('Escreva o código da transação ou cole a SMS do M-Pesa.'); return; }
    setSending(true); setError('');
    try {
      // Texto curto sem espaços = código; texto longo = SMS colada (o servidor extrai o código)
      const looksLikeCode = !/\s/.test(value) && value.length <= 20;
      const res = await api.post<{ paid: boolean; order?: any }>(`/orders/${orderId}/payment-proof`,
        looksLikeCode ? { transactionId: value } : { proofText: value });
      const next: MpesaPaymentState = res.order
        ? { paymentStatus: res.order.paymentStatus, mpesaTransactionId: res.order.mpesaTransactionId, paymentSubmittedAt: res.order.paymentSubmittedAt, paymentRejectedReason: res.order.paymentRejectedReason }
        : { ...state, paymentStatus: res.paid ? 'paid' : state.paymentStatus, paymentSubmittedAt: new Date().toISOString() };
      setState(next); onChange?.(next); setInput('');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  if (paid) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 p-4 flex items-start gap-3 text-left">
        <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-300">Pagamento confirmado</p>
          <p className="text-sm text-green-700/90 dark:text-green-400/90">
            {state.mpesaTransactionId ? `Transação ${state.mpesaTransactionId}. ` : ''}Já estamos a preparar a sua encomenda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-default bg-surface-raised p-4 text-left space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0"><Smartphone className="w-5 h-5" /></span>
        <div>
          <p className="font-semibold text-content-primary leading-tight">Pagar com M-Pesa</p>
          <p className="text-xs text-content-muted">Pagamento ao comerciante</p>
        </div>
      </div>

      {awaiting ? (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 p-3 flex items-start gap-2.5">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Recebemos o código <strong className="font-mono">{state.mpesaTransactionId}</strong>. Vamos confirmar o pagamento e avisamos por email.
          </p>
        </div>
      ) : (
        <>
          {state.paymentRejectedReason && (
            <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-300">Não confirmámos o pagamento: {state.paymentRejectedReason}. Verifique o código e envie novamente.</p>
            </div>
          )}

          <ol className="text-sm text-content-secondary space-y-1.5 list-decimal pl-5">
            <li>No M-Pesa (app ou <span className="font-mono">*150#</span>), escolha <strong>Pagar ao comerciante</strong>.</li>
            <li>Use os dados abaixo e confirme com o seu PIN.</li>
            <li>Escreva aqui o código da transação que vem na SMS de confirmação.</li>
          </ol>

          <dl className="rounded-xl bg-surface-base border border-border-default divide-y divide-border-default">
            <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1.5">
              <dt className="text-sm text-content-muted">Código do comerciante</dt>
              <dd className="flex items-center gap-1"><span className="font-mono font-bold text-lg tracking-wider text-content-primary">{merchant.code}</span><CopyButton value={merchant.code} label="Copiar código do comerciante" /></dd>
            </div>
            {merchant.name && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <dt className="text-sm text-content-muted">Nome</dt>
                <dd className="font-semibold text-content-primary text-right">{merchant.name}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1.5">
              <dt className="text-sm text-content-muted">Valor</dt>
              <dd className="flex items-center gap-1"><span className="font-bold text-content-primary tabular-nums">{amount}</span><CopyButton value={String(Number(total).toFixed(2))} label="Copiar valor" /></dd>
            </div>
            {orderNumber && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <dt className="text-sm text-content-muted">Referência</dt>
                <dd className="font-mono text-sm text-content-primary">{orderNumber}</dd>
              </div>
            )}
          </dl>

          <form onSubmit={submit} className="space-y-2">
            <label htmlFor={`mpesa-${orderId}`} className="block text-sm font-medium text-content-primary">Código da transação</label>
            <textarea
              id={`mpesa-${orderId}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={2}
              autoCapitalize="characters"
              placeholder="Ex.: CJK7XYZ123 — ou cole aqui a SMS do M-Pesa"
              className="w-full rounded-xl border border-border-default bg-surface-base px-3 py-2.5 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-green-500/40 resize-none"
            />
            {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
            <button type="submit" disabled={sending}
              className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> A enviar…</> : 'Já paguei — enviar código'}
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default MpesaPaymentPanel;
