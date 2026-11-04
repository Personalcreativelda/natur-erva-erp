import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ShoppingCart, Plus, Minus, Package, ArrowRight, Trash2, ShieldCheck } from 'lucide-react';
import uploadService from '../../../services/uploadService';
import { useCart } from '../context/CartContext';
import { formatMT } from '../utils/pricing';

/**
 * Carrinho único da loja — bottom sheet no mobile, painel lateral no desktop.
 * Montado uma vez no PublicLayout; o estado vem do CartContext.
 */
export const CartDrawer: React.FC = () => {
  const navigate = useNavigate();
  const { items, count, subtotal, isOpen, close, updateQuantity, removeItem, requestCheckout } = useCart();
  const [notice, setNotice] = useState<string | null>(null);

  // Fechar com Esc e bloquear o scroll da página por baixo
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, close]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  if (!isOpen) return null;

  const handleQty = (productId: string, variantId: string | undefined, delta: number) => {
    const res = updateQuantity(productId, variantId, delta);
    if (!res.ok) setNotice(res.message);
  };

  const handleCheckout = () => {
    // Na página da loja o checkout abre directamente; noutras páginas leva à loja e abre lá
    if (!requestCheckout()) {
      close();
      navigate('/', { state: { startCheckout: true } });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true" aria-label="Carrinho de compras">
      <div className="absolute inset-0 modal-overlay-bg" onClick={close} />

      <div
        className="relative flex flex-col bg-surface-raised shadow-2xl w-full max-h-[90dvh] rounded-t-3xl animate-cart-up md:max-h-none md:h-full md:max-w-md md:rounded-none md:animate-cart-right"
      >
        {/* Pega do bottom sheet (mobile) */}
        <div className="md:hidden flex justify-center pt-3">
          <span className="w-10 h-1 rounded-full bg-border-strong/60" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default shrink-0">
          <div>
            <h2 className="text-xl font-bold text-content-primary">Carrinho</h2>
            <p className="text-sm text-content-muted mt-0.5">
              {count} {count === 1 ? 'artigo' : 'artigos'}
            </p>
          </div>
          <button
            onClick={close}
            className="w-11 h-11 flex items-center justify-center rounded-full text-content-muted hover:bg-surface-overlay transition-colors"
            aria-label="Fechar carrinho"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {notice && (
          <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm" role="status">
            {notice}
          </div>
        )}

        {/* Itens */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full px-6 py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-brand-600/5 flex items-center justify-center mb-4">
                <ShoppingCart className="h-9 w-9 text-brand-600/60" />
              </div>
              <p className="text-lg font-semibold text-content-primary mb-1">O seu carrinho está vazio</p>
              <p className="text-sm text-content-muted max-w-xs mb-6">
                Explore os nossos produtos naturais e adicione os seus favoritos.
              </p>
              <button
                onClick={() => { close(); navigate('/'); setTimeout(() => document.getElementById('produtos-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
                className="px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:opacity-90 transition"
              >
                Ver produtos
              </button>
            </div>
          ) : (
            <ul className="p-4 space-y-3">
              {items.map(item => {
                const atMax = item.maxStock != null && item.quantity >= item.maxStock;
                return (
                  <li
                    key={`${item.productId}-${item.variantId || 'base'}`}
                    className="flex gap-3 bg-surface-base rounded-2xl p-3 border border-border-default"
                  >
                    {item.image ? (
                      <img
                        src={uploadService.getPublicUrl(item.image)}
                        alt={item.productName}
                        className="w-20 h-20 object-cover rounded-xl shrink-0 bg-surface-raised"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-20 h-20 bg-surface-overlay rounded-xl flex items-center justify-center shrink-0">
                        <Package className="h-8 w-8 text-content-muted" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-content-primary text-sm line-clamp-2">{item.productName}</h3>
                          {item.variantName && <p className="text-xs text-content-muted mt-0.5">{item.variantName}</p>}
                        </div>
                        <button
                          onClick={() => removeItem(item.productId, item.variantId)}
                          className="w-9 h-9 -mt-1 -mr-1 flex items-center justify-center rounded-full text-content-muted hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                          aria-label={`Remover ${item.productName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                        <div className="flex items-center rounded-xl border border-border-default bg-surface-raised">
                          <button
                            onClick={() => handleQty(item.productId, item.variantId, -1)}
                            className="w-10 h-10 flex items-center justify-center text-content-secondary hover:bg-surface-overlay rounded-l-xl transition-colors"
                            aria-label="Diminuir quantidade"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-8 text-center font-semibold text-content-primary text-sm tabular-nums" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => handleQty(item.productId, item.variantId, 1)}
                            disabled={atMax}
                            className="w-10 h-10 flex items-center justify-center text-content-secondary hover:bg-surface-overlay rounded-r-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Aumentar quantidade"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <span className="font-bold text-content-primary text-sm tabular-nums">
                          {formatMT(item.price * item.quantity)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Resumo + CTA (zona do polegar) */}
        {items.length > 0 && (
          <div
            className="border-t border-border-default px-5 pt-4 space-y-3 shrink-0 bg-surface-raised"
            style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
          >
            <div className="flex items-center justify-between">
              <span className="text-content-secondary">Subtotal</span>
              <span className="text-2xl font-bold text-content-primary tabular-nums">{formatMT(subtotal)}</span>
            </div>
            <p className="text-xs text-content-muted">Taxa de entrega e cupões calculados no passo seguinte.</p>
            <button
              onClick={handleCheckout}
              className="w-full text-white py-4 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 bg-brand-600 hover:opacity-95 active:scale-[0.99] transition-all"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -10px var(--brand-600)' }}
            >
              Finalizar pedido
              <ArrowRight className="h-5 w-5" />
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-content-muted">
              <ShieldCheck className="w-3.5 h-3.5" /> Confirmamos o pedido consigo por telefone/WhatsApp
            </p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes cart-slide-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes cart-slide-up    { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .animate-cart-up { animation: cart-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        @media (min-width: 768px) {
          .md\\:animate-cart-right { animation: cart-slide-right 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        }
      `}</style>
    </div>
  );
};
