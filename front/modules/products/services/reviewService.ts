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
  created_at: string;
}

export interface RatingStats {
  average: number;
  total: number;
}

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

export async function getAllReviews(limit = 24): Promise<ProductReview[]> {
  try {
    const data = await api.get<ProductReview[]>(`/reviews?limit=${limit}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

/** Lança erro se não conseguir gravar na base de dados — o chamador deve avisar o utilizador, nunca fingir sucesso. */
export async function submitReview(
  productId: string,
  userName: string,
  rating: number,
  comment: string
): Promise<void> {
  await api.post('/reviews', {
    product_id: productId,
    user_name: userName.trim(),
    rating,
    comment: comment.trim(),
  });
  statsCache.delete(productId);
}
