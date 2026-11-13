import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, ChevronLeft, Clock, Copy, Loader2, XCircle } from 'lucide-react';
import api from '../../core/services/apiClient';
import { getSystemSettings, type PaymentMethodConfig } from '../../core/services/systemSettingsService';
import { formatMoney } from '../../core/utils/money';
import { PaymentMethodLogo } from './PaymentMethodLogo';

/**
 * Pagamento móvel ao comerciante (M-Pesa ou e-Mola), sem fornecedor de pagamentos.
 *  1. O cliente escolhe o método (só os activos em Finanças → Métodos de pagamento).
 *  2. Vê as instruções desse método: USSD, código do comerciante, nome, valor e referência.
 *  3. Envia o código da transação (ou cola a SMS). O backend confirma sozinho quando a SMS do
 *     comerciante tiver o mesmo código; senão a equipa confirma pelo WhatsApp/painel.
 * Ver backend/services/paymentService.js.
 */
export interface MpesaPaymentState {
  paymentStatus?: string;
  paymentMethod?: string | null;
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

export const MobilePaymentPanel: React.FC<Props> = ({ orderId, orderNumber, total, onChange, ...initial }) => {
  const [methods, setMethods] = useState<PaymentMethodConfig[] | null>(null);
  const [selected, setSelected] = useState<string | null>(initial.paymentMethod || null);
  const [state, setState] = useState<MpesaPaymentState>(initial);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSystemSettings().then(s => {
      const active = (s.payment_methods || []).filter(m => m.enabled && m.merchantCode);
      setMethods(active);
      // Um só método activo → escolhido automaticamente
      if (active.length === 1) setSelected(prev => prev || active[0].id);
    }).catch(() => setMethods([]));
  }, []);

  if (!methods || methods.length === 0) return null;

  const paid = state.paymentStatus === 'paid';
  const awaiting = !paid && !!state.paymentSubmittedAt;
  const method = methods.find(m => m.id === selected) || null;
  const usedMethod = methods.find(m => m.id === state.paymentMethod) || method;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method) return;
    const value = input.trim();
    if (!value) { setError('Escreva o código da transação ou cole a SMS de confirmação.'); return; }
    setSending(true); setError('');
    try {
      // Texto curto sem espaços = código; texto longo = SMS colada (o servidor extrai o código)
      const looksLikeCode = !/\s/.test(value) && value.length <= 30;
      const res = await api.post<{ paid: boolean; order?: any }>(`/orders/${orderId}/payment-proof`,
        { method: method.id, ...(looksLikeCode ? { transactionId: value } : { proofText: value }) });
      const next: MpesaPaymentState = res.order
        ? { paymentStatus: res.order.paymentStatus, paymentMethod: res.order.paymentMethod, mpesaTransactionId: res.order.mpesaTransactionId, paymentSubmittedAt: res.order.paymentSubmittedAt, paymentRejectedReason: res.order.paymentRejectedReason }
        : { ...state, paymentMethod: method.id, paymentStatus: res.paid ? 'paid' : state.paymentStatus, paymentSubmittedAt: new Date().toISOString() };
      setState(next); onChange?.(next); setInput('');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  // ── Pago ────────────────────────────────────────────────────────────────────
  if (paid) {
    return (
      <div className="rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/20 p-4 flex items-start gap-3 text-left">
        <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-green-800 dark:text-green-300">Pagamento confirmado{usedMethod ? ` · ${usedMethod.label}` : ''}</p>
          <p className="text-sm text-green-700/90 dark:text-green-400/90">
            {state.mpesaTransactionId ? `Transação ${state.mpesaTransactionId}. ` : ''}Já estamos a preparar a sua encomenda.
          </p>
        </div>
      </div>
    );
  }

  // ── Código enviado, à espera de confirmação ────────────────────────────────
  if (awaiting) {
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-4 text-left flex items-start gap-3">
        <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="font-semibold text-amber-800 dark:text-amber-300">A confirmar pagamento{usedMethod ? ` · ${usedMethod.label}` : ''}</p>
          <p className="text-sm text-amber-800/90 dark:text-amber-300/90">
            Recebemos o código <strong className="font-mono">{state.mpesaTransactionId}</strong>. Vamos confirmar e avisamos por email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-default bg-surface-raised p-4 text-left space-y-3">
      {state.paymentRejectedReason && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-3 flex items-start gap-2.5">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">Não confirmámos o pagamento: {state.paymentRejectedReason}. Verifique o código e envie novamente.</p>
        </div>
      )}

      {/* ── 1. Escolher o método ──────────────────────────────────────────── */}
      {!method ? (
        <>
          <p className="font-semibold text-content-primary">Como vai pagar?</p>
          <div className={`grid gap-3 ${methods.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {methods.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => { setSelected(m.id); setError(''); }}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-border-default bg-surface-base px-3 py-4 hover:border-green-500 active:scale-[0.98] transition"
              >
                <PaymentMethodLogo method={m.id} logoUrl={m.logoUrl} size="lg" />
                <span className="text-sm font-semibold text-content-primary">{m.label}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* ── 2. Instruções do método escolhido ───────────────────────────── */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <PaymentMethodLogo method={method.id} logoUrl={method.logoUrl} />
              <div className="min-w-0">
                <p className="font-semibold text-content-primary leading-tight">Pagar com {method.label}</p>
                <p className="text-xs text-content-muted">Pagamento ao comerciante</p>
              </div>
            </div>
            {methods.length > 1 && (
              <button type="button" onClick={() => setSelected(null)} className="shrink-0 inline-flex items-center gap-0.5 text-sm font-medium text-green-700 dark:text-green-400">
                <ChevronLeft className="w-4 h-4" /> Trocar
              </button>
            )}
          </div>

          <ol className="text-sm text-content-secondary space-y-1.5 list-decimal pl-5">
            <li>Marque <span className="font-mono font-semibold">{method.ussd}</span> (ou abra a app {method.label}) e escolha <strong>Pagar ao comerciante</strong>.</li>
            <li>Use o código e o valor abaixo e confirme com o seu PIN.</li>
            <li>Escreva aqui o código da transação que vem na SMS de confirmação.</li>
          </ol>

          <dl className="rounded-xl bg-surface-base border border-border-default divide-y divide-border-default">
            <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1.5">
              <dt className="text-sm text-content-muted">Código do comerciante</dt>
              <dd className="flex items-center gap-1"><span className="font-mono font-bold text-lg tracking-wider text-content-primary">{method.merchantCode}</span><CopyButton value={method.merchantCode} label="Copiar código do comerciante" /></dd>
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <dt className="text-sm text-content-muted">Nome</dt>
              <dd className="font-semibold text-content-primary text-right">{method.merchantName || 'Natur Erva'}</dd>
            </div>
            <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1.5">
              <dt className="text-sm text-content-muted">Valor</dt>
              <dd className="flex items-center gap-1"><span className="font-bold text-content-primary tabular-nums">{formatMoney(total)}</span><CopyButton value={String(Number(total).toFixed(2))} label="Copiar valor" /></dd>
            </div>
            {orderNumber && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                <dt className="text-sm text-content-muted">Referência</dt>
                <dd className="font-mono text-sm text-content-primary">{orderNumber}</dd>
              </div>
            )}
          </dl>

          {/* ── 3. Enviar o código da transação ─────────────────────────────── */}
          <form onSubmit={submit} className="space-y-2">
            <label htmlFor={`pay-${orderId}`} className="block text-sm font-medium text-content-primary">Código da transação</label>
            <textarea
              id={`pay-${orderId}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              rows={2}
              autoCapitalize="characters"
              placeholder={`Ex.: CJK7XYZ123 — ou cole aqui a SMS do ${method.label}`}
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

/** Nome antigo mantido (usado no checkout e na página do pedido). */
export const MpesaPaymentPanel = MobilePaymentPanel;
export default MobilePaymentPanel;
