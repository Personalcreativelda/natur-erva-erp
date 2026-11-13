import React, { useState } from 'react';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { PaymentMethodLogo } from '../../../shop/components/PaymentMethodLogo';
import api from '../../../core/services/apiClient';
import type { Order } from '../../../core/types/order';
import { useToast } from '../../../core/contexts/ToastContext';

/**
 * Painel da equipa para pagamentos M-Pesa ao comerciante: mostra o código da transação enviado pelo
 * cliente e permite confirmar ou rejeitar. Usa as mesmas rotas que os comandos de WhatsApp
 * (CONFIRMAR / REJEITAR NE-…) — backend/services/paymentService.js.
 */
export const OrderPaymentReview: React.FC<{ order: Order; onUpdated: (order: Order) => void }> = ({ order, onUpdated }) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const hasMpesa = !!order.mpesaTransactionId || !!order.paymentSubmittedAt;
  const paid = order.paymentStatus === 'paid';
  if (!hasMpesa && !order.paymentRejectedReason) return null;

  const confirm = async () => {
    setBusy('confirm');
    try {
      const res = await api.post<{ order: Order; alreadyPaid?: boolean }>(`/orders/${order.id}/confirm-payment`, {});
      onUpdated(res.order);
      showToast(res.alreadyPaid ? 'Este pedido já estava pago' : 'Pagamento confirmado — o cliente foi avisado por email', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível confirmar o pagamento', 'error');
    } finally { setBusy(null); }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      const res = await api.post<{ order: Order }>(`/orders/${order.id}/reject-payment`, { reason: reason.trim() || undefined });
      onUpdated(res.order);
      setRejecting(false); setReason('');
      showToast('Pagamento rejeitado — o cliente foi avisado para reenviar', 'info');
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível rejeitar o pagamento', 'error');
    } finally { setBusy(null); }
  };

  return (
    <div className="mb-4 rounded-xl border border-border-default p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <PaymentMethodLogo method={order.paymentMethod === 'emola' ? 'emola' : 'mpesa'} size="sm" />
        <p className="text-xs text-content-muted uppercase font-medium">Pagamento {order.paymentMethod === 'emola' ? 'e-Mola' : 'M-Pesa'}</p>
      </div>

      {order.mpesaTransactionId && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-content-muted">Transação</span>
          <span className="font-mono font-semibold text-content-primary">{order.mpesaTransactionId}</span>
        </div>
      )}

      {paid ? (
        <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          Pago{order.paymentConfirmedBy === 'auto:mpesa-sms' ? ' — confirmado automaticamente pela SMS do comerciante' : ''}
          {order.paymentConfirmedAt ? ` · ${new Date(order.paymentConfirmedAt).toLocaleString('pt-MZ', { dateStyle: 'short', timeStyle: 'short' })}` : ''}
        </p>
      ) : order.paymentSubmittedAt ? (
        <>
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Clock className="w-4 h-4" /> O cliente indicou que pagou — confirme no telemóvel do comerciante.
          </p>
          {rejecting ? (
            <div className="space-y-2">
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (ex.: transação não encontrada)"
                className="w-full rounded-lg border border-border-default bg-surface-base px-3 py-2 text-sm text-content-primary" />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setRejecting(false)} className="h-10 rounded-lg border border-border-default text-sm text-content-secondary">Voltar</button>
                <button onClick={reject} disabled={!!busy} className="h-10 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                  {busy === 'reject' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Rejeitar
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRejecting(true)} disabled={!!busy} className="h-10 rounded-lg border border-border-default text-sm font-medium text-content-secondary hover:bg-surface-base disabled:opacity-60">
                Rejeitar
              </button>
              <button onClick={confirm} disabled={!!busy} className="h-10 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Confirmar pagamento
              </button>
            </div>
          )}
        </>
      ) : order.paymentRejectedReason ? (
        <p className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400"><XCircle className="w-4 h-4" /> Rejeitado: {order.paymentRejectedReason}</p>
      ) : null}
    </div>
  );
};

export default OrderPaymentReview;
