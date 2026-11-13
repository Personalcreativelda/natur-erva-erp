import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2, MessageSquare, Search, Star, Trash2 } from 'lucide-react';
import { PageShell } from '../../core/components/layout/PageShell';
import { ConfirmDialog } from '../../core/components/ui/ConfirmDialog';
import { deleteReview, getAdminReviews, setReviewHidden } from '../../products/services/reviewService';
import type { ProductReview } from '../../products/services/reviewService';

type StatusFilter = 'all' | 'visible' | 'hidden';

interface ReviewsProps {
  showToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'visible', label: 'Publicadas' },
  { id: 'hidden', label: 'Ocultas' },
];

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="flex" aria-label={`${rating} de 5 estrelas`}>
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} aria-hidden="true" className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} />
    ))}
  </span>
);

const Avatar: React.FC<{ review: ProductReview }> = ({ review }) => {
  const [broken, setBroken] = useState(false);
  return review.avatar_url && !broken ? (
    <img src={review.avatar_url} alt="" onError={() => setBroken(true)} className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
      {review.user_name?.charAt(0).toUpperCase() || '?'}
    </span>
  );
};

export const Reviews: React.FC<ReviewsProps> = ({ showToast }) => {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProductReview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReviews(await getAdminReviews(status, query));
    } catch {
      showToast?.('Não foi possível carregar as avaliações.', 'error');
    } finally {
      setLoading(false);
    }
  }, [status, query, showToast]);

  useEffect(() => {
    const t = window.setTimeout(load, query ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [load, query]);

  const stats = useMemo(() => {
    const visible = reviews.filter(r => !r.is_hidden);
    const avg = visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : 0;
    return { total: reviews.length, hidden: reviews.length - visible.length, avg };
  }, [reviews]);

  const toggleHidden = async (review: ProductReview) => {
    setBusyId(review.id);
    try {
      await setReviewHidden(review.id, !review.is_hidden);
      setReviews(list => list.map(r => (r.id === review.id ? { ...r, is_hidden: !review.is_hidden } : r)));
      showToast?.(review.is_hidden ? 'Avaliação publicada na loja.' : 'Avaliação ocultada da loja.', 'success');
    } catch {
      showToast?.('Não foi possível actualizar a avaliação.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const review = toDelete;
    setToDelete(null);
    if (!review) return;
    setBusyId(review.id);
    try {
      await deleteReview(review.id);
      setReviews(list => list.filter(r => r.id !== review.id));
      showToast?.('Avaliação apagada.', 'success');
    } catch {
      showToast?.('Não foi possível apagar a avaliação.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageShell
      title="Avaliações"
      description="Modere os comentários dos clientes: oculte da loja ou apague avaliações indesejadas."
      icon={<MessageSquare className="w-5 h-5" />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs text-content-muted">Total</p>
            <p className="text-2xl font-bold text-content-primary tabular-nums">{stats.total}</p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs text-content-muted">Média publicada</p>
            <p className="text-2xl font-bold text-content-primary tabular-nums">{stats.avg.toFixed(1)}</p>
          </div>
          <div className="rounded-xl border border-border-default bg-surface-raised p-4">
            <p className="text-xs text-content-muted">Ocultas</p>
            <p className="text-2xl font-bold text-content-primary tabular-nums">{stats.hidden}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Pesquisar por cliente, produto ou texto…"
              aria-label="Pesquisar avaliações"
              className="w-full rounded-lg border border-border-default bg-surface-raised py-2.5 pl-9 pr-3 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-border-default bg-surface-raised p-1" role="tablist" aria-label="Filtrar avaliações">
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={status === f.id}
                onClick={() => setStatus(f.id)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${status === f.id ? 'bg-green-600 text-white' : 'text-content-secondary hover:bg-surface-overlay'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-content-muted" /></div>
        ) : reviews.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-raised py-12 text-center text-sm text-content-muted">
            Nenhuma avaliação encontrada.
          </div>
        ) : (
          <ul className="space-y-3">
            {reviews.map(r => (
              <li
                key={r.id}
                className={`rounded-xl border bg-surface-raised p-4 ${r.is_hidden ? 'border-dashed border-border-strong opacity-70' : 'border-border-default'}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar review={r} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold text-content-primary">{r.user_name}</p>
                      {r.user_email && <span className="text-xs text-content-muted">{r.user_email}</span>}
                      {r.is_hidden && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">Oculta</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-muted">
                      <Stars rating={r.rating} />
                      {r.product_name && <span>· {r.product_name}</span>}
                      <span>· {new Date(r.created_at).toLocaleDateString('pt-MZ')}</span>
                      {r.order_id && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700 dark:bg-green-900/30 dark:text-green-400">Compra verificada</span>}
                    </div>
                    {r.comment && <p className="mt-2 whitespace-pre-line text-sm text-content-secondary">{r.comment}</p>}
                    {r.photo_urls && r.photo_urls.length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {r.photo_urls.map(url => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="h-16 w-16 overflow-hidden rounded-lg border border-border-default">
                            <img src={url} alt="Fotografia da avaliação" loading="lazy" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => toggleHidden(r)}
                      disabled={busyId === r.id}
                      title={r.is_hidden ? 'Publicar na loja' : 'Ocultar da loja'}
                      aria-label={r.is_hidden ? `Publicar avaliação de ${r.user_name}` : `Ocultar avaliação de ${r.user_name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-default text-content-secondary hover:bg-surface-overlay disabled:opacity-50"
                    >
                      {r.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setToDelete(r)}
                      disabled={busyId === r.id}
                      title="Apagar"
                      aria-label={`Apagar avaliação de ${r.user_name}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:hover:bg-red-900/20"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!toDelete}
        variant="danger"
        title="Apagar avaliação?"
        message={toDelete ? `A avaliação de ${toDelete.user_name} será apagada definitivamente. Se só quer escondê-la da loja, use "Ocultar".` : ''}
        confirmText="Apagar"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </PageShell>
  );
};

export default Reviews;
