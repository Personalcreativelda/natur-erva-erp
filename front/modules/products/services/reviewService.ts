/**
 * reviewService — REST API backend (product_reviews table).
 * GET endpoints are public; POST requires auth token.
 * Nunca inventa avaliações: se o servidor não responder, devolve vazio
 * (leitura) ou propaga o erro (escrita) — não guarda nada só no browser
 * fingindo que foi publicado na base de dados.
 */
import api from '../../core/services/apiClient';

export interface ProductReview {
  id: string;
  product_id: string;
  user_name: string;
  rating: number;
  comment: string;
  avatar_url?: string | null;
  photo_urls?: string[];
  product_slug?: string | null;
  product_name?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  order_id?: string | null;
  is_hidden?: boolean;
  created_at: string;
}

export interface PendingReviewItem {
  product_id: string;
  order_id: string;
  product_name: string;
  product_slug?: string | null;
  product_image?: string | null;
  received_at: string;
}

export interface RatingStats {
  average: number;
  total: number;
}

export type ReviewsSummary = RatingStats;

// Per-product stats cache (TTL: 30 s)
const statsCache = new Map<string, { data: RatingStats; ts: number }>();
const CACHE_TTL = 30_000;

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getProductRating(productId: string): Promise<RatingStats> {
  const cached = statsCache.get(productId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const data = await api.get<{ total: number; average: number }>(`/reviews/stats/${productId}`);
    const stats: RatingStats = { average: Number(data?.average ?? 0), total: Number(data?.total ?? 0) };
    statsCache.set(productId, { data: stats, ts: Date.now() });
    return stats;
  } catch {
    return { average: 0, total: 0 };
  }
}

// ── Per-product reviews ───────────────────────────────────────────────────────

export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  try {
    const data = await api.get<ProductReview[]>(`/reviews/product/${productId}`);
    return data || [];
  } catch {
    return [];
  }
}

// ── All reviews (for testimonials section) ───────────────────────────────────

export async function getAllReviews(limit = 60): Promise<ProductReview[]> {
  try {
    const data = await api.get<ProductReview[]>(`/reviews?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function getReviewsSummary(): Promise<ReviewsSummary> {
  try {
    const data = await api.get<ReviewsSummary>('/reviews/summary');
    return { average: Number(data?.average ?? 0), total: Number(data?.total ?? 0) };
  } catch {
    return { average: 0, total: 0 };
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

/** Lança erro se não conseguir gravar na base de dados — o chamador deve avisar o utilizador, nunca fingir sucesso. */
export async function submitReview(
  productId: string,
  userName: string,
  rating: number,
  comment: string,
  photoData: string[] = [],
  orderId?: string
): Promise<void> {
  await api.post('/reviews', {
    product_id: productId,
    user_name: userName.trim(),
    rating,
    comment: comment.trim(),
    photo_data: photoData.slice(0, 3),
    order_id: orderId,
  });
  statsCache.delete(productId);
}

// ── Conta do cliente ─────────────────────────────────────────────────────────

/** Produtos de encomendas entregues/concluídas que o cliente ainda não avaliou. */
export async function getPendingReviews(): Promise<PendingReviewItem[]> {
  const data = await api.get<PendingReviewItem[]>('/reviews/pending');
  return Array.isArray(data) ? data : [];
}

export async function getMyReviews(): Promise<ProductReview[]> {
  const data = await api.get<ProductReview[]>('/reviews/me');
  return Array.isArray(data) ? data : [];
}

// ── Moderação (admin) ────────────────────────────────────────────────────────

export async function getAdminReviews(status: 'all' | 'visible' | 'hidden' = 'all', q = ''): Promise<ProductReview[]> {
  const params = new URLSearchParams({ status });
  if (q.trim()) params.set('q', q.trim());
  const data = await api.get<ProductReview[]>(`/reviews/admin?${params.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function setReviewHidden(id: string, isHidden: boolean): Promise<void> {
  await api.patch(`/reviews/${id}`, { is_hidden: isHidden });
  statsCache.clear();
}

export async function deleteReview(id: string): Promise<void> {
  await api.delete(`/reviews/${id}`);
  statsCache.clear();
}
