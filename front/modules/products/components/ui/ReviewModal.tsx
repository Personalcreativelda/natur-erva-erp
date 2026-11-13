import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, User, Star, MessageSquare, ImagePlus, Trash2 } from 'lucide-react';
import { StarRating } from './StarRating';
import {
 getProductReviews,
 getProductRating,
 submitReview,
} from '../../services/reviewService';
import type { ProductReview, RatingStats } from '../../services/reviewService';

interface ReviewModalProps {
 productId: string;
 productName: string;
 currentUserName?: string;
 onClose: () => void;
 onStatsChange?: (stats: RatingStats) => void;
}

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(String(reader.result));
 reader.onerror = () => reject(reader.error);
 reader.readAsDataURL(file);
});

export const ReviewModal: React.FC<ReviewModalProps> = ({
 productId,
 productName,
 currentUserName,
 onClose,
 onStatsChange,
}) => {
 const [reviews, setReviews] = useState<ProductReview[]>([]);
 const [stats, setStats] = useState<RatingStats>({ average: 0, total: 0 });
 const [loading, setLoading] = useState(true);

 const [newRating, setNewRating] = useState(5);
 const [newComment, setNewComment] = useState('');
 const [newName, setNewName] = useState(currentUserName || '');
 const [newPhotos, setNewPhotos] = useState<string[]>([]);
 const [submitting, setSubmitting] = useState(false);
 const [successMsg, setSuccessMsg] = useState(false);
 const [submitError, setSubmitError] = useState<string | null>(null);

 const load = useCallback(async () => {
 setLoading(true);
 const [r, s] = await Promise.all([
 getProductReviews(productId),
 getProductRating(productId),
 ]);
 setReviews(r);
 setStats(s);
 onStatsChange?.(s);
 setLoading(false);
 }, [productId, onStatsChange]);

 useEffect(() => {
 load();
 }, [load]);

 // Close on Escape key
 useEffect(() => {
 const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
 document.addEventListener('keydown', handler);
 return () => document.removeEventListener('keydown', handler);
 }, [onClose]);

 async function handleSubmit(e: React.FormEvent) {
 e.preventDefault();
 if (!newName.trim() || !newComment.trim() || newRating < 1) return;
 setSubmitting(true);
 setSubmitError(null);
 try {
 await submitReview(productId, newName.trim(), newRating, newComment.trim(), newPhotos);
 setSuccessMsg(true);
 setNewComment('');
 setNewRating(5);
 setNewPhotos([]);
 await load();
 setTimeout(() => setSuccessMsg(false), 3000);
 } catch {
 setSubmitError('Não foi possível enviar a avaliação. Verifica a tua ligação e tenta novamente.');
 } finally {
 setSubmitting(false);
 }
 }

 async function handlePhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
 const selected = Array.from(e.target.files || []);
 e.target.value = '';
 if (!selected.length) return;
 if (newPhotos.length + selected.length > 3) {
 setSubmitError('Pode adicionar no máximo 3 fotografias.');
 return;
 }
 const invalid = selected.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024);
 if (invalid) {
 setSubmitError('Use imagens JPG, PNG ou WebP com no máximo 5 MB cada.');
 return;
 }
 try {
 const dataUrls = await Promise.all(selected.map(fileToDataUrl));
 setNewPhotos(current => [...current, ...dataUrls].slice(0, 3));
 setSubmitError(null);
 } catch {
 setSubmitError('Não foi possível ler uma das fotografias.');
 }
 }

 const formatDate = (iso: string) =>
 new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });

 const modal = (
 <>
 {/* Backdrop */}
 <div
 className="fixed inset-0 bg-black/50 z-[200]"
 onClick={onClose}
 aria-hidden="true"
 />

 {/* Panel */}
 <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
 <div
 className="relative w-full max-w-lg max-h-[90vh] flex flex-col bg-surface-raised rounded-2xl shadow-2xl overflow-hidden"
 onClick={(e) => e.stopPropagation()}
 role="dialog"
 aria-modal="true"
 aria-labelledby="review-modal-title"
 >
 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-border-default">
 <div>
 <h2 id="review-modal-title" className="text-lg font-semibold text-content-primary flex items-center gap-2">
 <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
 Avaliações
 </h2>
 <p className="text-sm text-content-muted truncate max-w-xs">{productName}</p>
 </div>
 <button
 onClick={onClose}
 className="tap-target p-2 rounded-lg text-content-muted hover:bg-surface-base transition-colors"
 aria-label="Fechar"
 >
 <X className="w-5 h-5" />
 </button>
 </div>

 <div className="overflow-y-auto flex-1">
 {/* Stats summary */}
 {stats.total > 0 && (
 <div className="flex items-center gap-6 px-6 py-5 bg-surface-base/50">
 <div className="text-center">
 <p className="text-5xl font-bold text-content-primary leading-none">{stats.average.toFixed(1)}</p>
 <StarRating value={stats.average} size="sm" />
 <p className="text-xs text-content-muted mt-1">{stats.total} avaliações</p>
 </div>
 <div className="flex-1 space-y-1">
 {[5, 4, 3, 2, 1].map((star) => {
 const starCount = reviews.filter((r) => r.rating === star).length;
 const pct = stats.total ? Math.round((starCount / stats.total) * 100) : 0;
 return (
 <div key={star} className="flex items-center gap-2 text-xs text-content-secondary">
 <span className="w-3 text-right">{star}</span>
 <Star className="w-3 h-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
 <div className="flex-1 h-2 bg-surface-base rounded-full overflow-hidden">
 <div
 className="h-full bg-yellow-400 rounded-full transition-all duration-500"
 style={{ width: `${pct}%` }}
 />
 </div>
 <span className="w-7 text-right">{pct}%</span>
 </div>
 );
 })}
 </div>
 </div>
 )}

 {/* Review form */}
 <form onSubmit={handleSubmit} className="px-6 py-5 border-b border-border-default">
 <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
 <MessageSquare className="w-4 h-4 text-green-600" />
 Deixar avaliação
 </h3>

 {successMsg && (
 <div className="mb-3 text-sm text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400 px-4 py-2.5 rounded-lg">
 Obrigado pela sua avaliação!
 </div>
 )}
 {submitError && (
 <div className="mb-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-4 py-2.5 rounded-lg">
 {submitError}
 </div>
 )}

 <div className="space-y-3">
 {/* Name */}
 <div className="relative">
 <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
 <input
 type="text"
 value={newName}
 onChange={(e) => setNewName(e.target.value)}
 placeholder="O seu nome"
 required
 maxLength={50}
 className="w-full pl-9 pr-3 py-2.5 text-sm border border-border-default rounded-lg bg-surface-raised text-content-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
 />
 </div>

 {/* Stars */}
 <div>
 <p className="text-xs text-content-muted mb-1.5">Classificação</p>
 <StarRating value={newRating} onChange={setNewRating} size="lg" />
 </div>

 {/* Comment */}
 <textarea
 value={newComment}
 onChange={(e) => setNewComment(e.target.value)}
 placeholder="Partilhe a sua experiência com este produto..."
 required
 maxLength={500}
 rows={3}
 className="w-full px-3 py-2.5 text-sm border border-border-default rounded-lg bg-surface-raised text-content-primary placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
 />

 {/* Optional review photos */}
 <div>
 <p className="mb-2 text-sm font-medium text-content-primary">Fotografias da sua experiência</p>
 <p className="mb-3 text-xs text-content-muted">Opcional — pode carregar até 3 fotografias.</p>
 <div className="mb-2">
 {newPhotos.length < 3 && (
 <label className="flex min-h-24 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface-base px-4 py-4 text-center transition-colors hover:border-green-500 hover:bg-green-50/60 dark:hover:bg-green-900/10">
 <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
 <ImagePlus className="w-5 h-5" aria-hidden="true" />
 </span>
 <span className="text-sm font-semibold text-green-700 dark:text-green-400">Carregar fotografias</span>
 <span className="text-xs text-content-muted">JPG, PNG ou WebP · máximo 5 MB por foto</span>
 <input
 type="file"
 accept="image/jpeg,image/png,image/webp"
 multiple
 className="sr-only"
 onChange={handlePhotoInput}
 />
 </label>
 )}
 </div>
 {newPhotos.length > 0 && (
 <div className="grid grid-cols-3 gap-2">
 {newPhotos.map((photo, index) => (
 <div key={photo.slice(-24)} className="relative aspect-square overflow-hidden rounded-lg border border-border-default">
 <img src={photo} alt={`Fotografia ${index + 1} da avaliação`} className="h-full w-full object-cover" />
 <button
 type="button"
 onClick={() => setNewPhotos(current => current.filter((_, i) => i !== index))}
 aria-label={`Remover fotografia ${index + 1}`}
 className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white"
 >
 <Trash2 className="h-4 w-4" aria-hidden="true" />
 </button>
 </div>
 ))}
 </div>
 )}
 </div>

 <button
 type="submit"
 disabled={submitting || !newName.trim() || !newComment.trim()}
 className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
 >
 <Send className="w-4 h-4" />
 {submitting ? 'A enviar...' : 'Publicar avaliação'}
 </button>
 </div>
 </form>

 {/* Reviews list */}
 <div className="px-6 py-4 space-y-4">
 {loading ? (
 <div className="space-y-3">
 {[1, 2].map((i) => (
 <div key={i} className="animate-pulse space-y-2">
 <div className="h-3 bg-surface-base rounded w-1/3" />
 <div className="h-3 bg-surface-base rounded w-full" />
 <div className="h-3 bg-surface-base rounded w-4/5" />
 </div>
 ))}
 </div>
 ) : reviews.length === 0 ? (
 <p className="text-center text-sm text-content-muted py-6">
 Ainda não há avaliações. Seja o primeiro a avaliar!
 </p>
 ) : (
 reviews.map((r) => (
 <div key={r.id} className="pb-4 border-b border-border-default last:border-0">
 <div className="flex items-start justify-between gap-2">
 <div className="flex items-center gap-2">
 {r.avatar_url ? (
 <img
 src={r.avatar_url}
 alt={`Fotografia de ${r.user_name}`}
 className="w-8 h-8 rounded-full object-cover flex-shrink-0"
 />
 ) : (
 <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
 <span className="text-green-700 dark:text-green-400 text-sm font-semibold">
 {r.user_name.charAt(0).toUpperCase()}
 </span>
 </div>
 )}
 <div>
 <p className="text-sm font-semibold text-content-primary">{r.user_name}</p>
 <StarRating value={r.rating} size="sm" />
 </div>
 </div>
 <span className="text-xs text-content-muted flex-shrink-0">{formatDate(r.created_at)}</span>
 </div>
 {r.comment && (
 <p className="mt-2 ml-10 text-sm text-content-secondary leading-relaxed">{r.comment}</p>
 )}
 {r.photo_urls && r.photo_urls.length > 0 && (
 <div className="mt-3 ml-10 grid grid-cols-3 gap-2">
 {r.photo_urls.slice(0, 3).map((photo, index) => (
 <a key={photo} href={photo} target="_blank" rel="noopener noreferrer" className="aspect-square overflow-hidden rounded-lg border border-border-default">
 <img src={photo} alt={`Fotografia ${index + 1} da avaliação de ${r.user_name}`} loading="lazy" className="h-full w-full object-cover" />
 </a>
 ))}
 </div>
 )}
 </div>
 ))
 )}
 </div>
 </div>
 </div>
 </div>
 </>
 );

 return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
};
