import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageSquare, Quote, Star } from 'lucide-react';
import { useMobile } from '../../core/hooks/useMobile';
import {
  getAllReviews,
} from '../../products/services/reviewService';
import type { ProductReview } from '../../products/services/reviewService';

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

const StarRow: React.FC<{ rating: number; className?: string }> = ({ rating, className = '' }) => (
  <div className={`flex items-center gap-0.5 ${className}`} aria-label={`${rating} de 5 estrelas`}>
    {Array.from({ length: 5 }).map((_, index) => (
      <Star
        key={index}
        aria-hidden="true"
        className={`h-4 w-4 ${index < Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'fill-transparent text-border-strong'}`}
      />
    ))}
  </div>
);

const ReviewAvatar: React.FC<{ review: ProductReview }> = ({ review }) => {
  const initial = review.user_name?.trim().charAt(0).toUpperCase() || 'C';
  return review.avatar_url ? (
    <img
      src={review.avatar_url}
      alt={`Fotografia de ${review.user_name}`}
      loading="lazy"
      className="h-12 w-12 shrink-0 rounded-full border-2 border-white object-cover shadow-sm dark:border-gray-700"
    />
  ) : (
    <span
      aria-hidden="true"
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-700 text-base font-bold text-white shadow-sm"
    >
      {initial}
    </span>
  );
};

const ReviewCard: React.FC<{ review: ProductReview; index: number; total: number; productUrl?: string }> = ({ review, index, total, productUrl }) => (
  <article
    role="group"
    aria-roledescription="slide"
    aria-label={`Avaliação ${index + 1} de ${total}`}
    className="relative flex min-h-[190px] h-full flex-col rounded-2xl border border-border-default bg-surface-raised p-5 shadow-sm sm:min-h-0 sm:p-6"
  >
    <Quote className="absolute right-5 top-5 h-8 w-8 fill-green-50 text-green-100 dark:fill-green-900/20 dark:text-green-900/40" aria-hidden="true" />
    <div className="flex items-center gap-3 pr-10">
      <ReviewAvatar review={review} />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-content-primary">{review.user_name}</p>
        <p className="mt-0.5 text-xs text-content-muted">{formatDate(review.created_at)}</p>
      </div>
    </div>
    <StarRow rating={review.rating} className="mt-4" />
    {productUrl ? (
      <Link
        to={productUrl}
        aria-label={`Abrir o produto relacionado com o comentário de ${review.user_name}`}
        className="mt-4 flex-1 rounded-md text-content-secondary transition-colors hover:text-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 dark:hover:text-green-400"
      >
        <blockquote className="text-sm italic leading-relaxed">“{review.comment}”</blockquote>
      </Link>
    ) : (
      <blockquote className="mt-4 flex-1 text-sm italic leading-relaxed text-content-secondary">“{review.comment}”</blockquote>
    )}
  </article>
);

const SkeletonCard = () => (
  <div className="h-60 rounded-2xl border border-border-default bg-surface-raised p-6 animate-pulse">
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 rounded-full bg-surface-overlay" />
      <div className="flex-1 space-y-2"><div className="h-3 w-1/2 rounded bg-surface-overlay" /><div className="h-2 w-1/3 rounded bg-surface-overlay" /></div>
    </div>
    <div className="mt-5 h-3 w-24 rounded bg-yellow-100 dark:bg-yellow-900/30" />
    <div className="mt-5 space-y-2"><div className="h-3 rounded bg-surface-overlay" /><div className="h-3 w-4/5 rounded bg-surface-overlay" /></div>
  </div>
);

export const TestimonialsSection: React.FC<{
  isAuthenticated?: boolean;
  onAction?: () => void;
}> = ({ isAuthenticated = false, onAction }) => {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isMobileCarousel = useMobile(640);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.('change', updatePreference);
    return () => media.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    getAllReviews(24)
      .then(setReviews)
      .catch(() => {
        setReviews([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const getStep = useCallback(() => {
    const track = trackRef.current;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !first) return 0;
    const gap = parseFloat(getComputedStyle(track).columnGap || '0') || 0;
    return first.offsetWidth + gap;
  }, []);

  const updateCarousel = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = getStep();
    setCanPrev(track.scrollLeft > 4);
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
    if (step > 0) setActive(Math.round(track.scrollLeft / step));
  }, [getStep]);

  useEffect(() => {
    updateCarousel();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateCarousel);
    observer.observe(track);
    return () => observer.disconnect();
  }, [reviews.length, updateCarousel]);

  const move = (direction: -1 | 1) => {
    const track = trackRef.current;
    if (!track) return;
    const step = getStep() || track.clientWidth;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    track.scrollBy({ left: direction * step, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    if (!isMobileCarousel || prefersReducedMotion || reviews.length < 2) return;
    const interval = window.setInterval(() => {
      const track = trackRef.current;
      if (!track || document.hidden) return;
      const step = getStep();
      if (!step) return;
      const current = Math.round(track.scrollLeft / step);
      const next = (current + 1) % reviews.length;
      track.scrollTo({ left: next * step, behavior: 'smooth' });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [getStep, isMobileCarousel, prefersReducedMotion, reviews.length]);

  return (
    <section className="bg-surface-base py-10 sm:py-14" aria-label="Avaliações dos clientes" aria-roledescription="carrossel">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 text-center sm:mb-8">
          <h2 className="text-xl font-bold text-content-primary sm:text-2xl">O que dizem os nossos clientes</h2>
          <p className="mt-1 text-sm text-content-muted">Avaliações reais dos nossos clientes</p>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(index => <SkeletonCard key={index} />)}
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border-strong bg-surface-raised px-6 py-10 text-center">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <MessageSquare className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="text-base font-semibold text-content-primary">Ainda não há avaliações</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-muted">Já experimentou os nossos produtos? Partilhe a sua experiência e ajude outros clientes a escolher.</p>
            {onAction && (
              <button type="button" onClick={onAction} className="mt-5 min-h-11 rounded-xl bg-green-600 px-5 text-sm font-semibold text-white hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2">
                {isAuthenticated ? 'Escolher um produto para avaliar' : 'Iniciar sessão para avaliar'}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="relative">
              <div
                ref={trackRef}
                onScroll={updateCarousel}
                className={`-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:px-0 ${reviews.length < 3 ? 'lg:justify-center' : ''}`}
              >
                {reviews.map((review, index) => (
                  <div key={review.id} className="w-[calc(100vw-2rem)] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]">
                    <ReviewCard
                      review={review}
                      index={index}
                      total={reviews.length}
                      productUrl={review.product_slug
                        ? `/loja/produto/${review.product_slug}#avaliacoes`
                        : undefined}
                    />
                  </div>
                ))}
              </div>

              {reviews.length > 1 && (
                <>
                  <button type="button" onClick={() => move(-1)} disabled={!canPrev} aria-label="Avaliação anterior" className="absolute left-0 top-1/2 hidden h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface-raised text-content-secondary shadow-md hover:text-green-700 disabled:pointer-events-none disabled:opacity-0 sm:flex">
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => move(1)} disabled={!canNext} aria-label="Avaliação seguinte" className="absolute right-0 top-1/2 hidden h-11 w-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-default bg-surface-raised text-content-secondary shadow-md hover:text-green-700 disabled:pointer-events-none disabled:opacity-0 sm:flex">
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>

            <div className="mt-4 flex items-center justify-center gap-3">
              <button type="button" onClick={() => move(-1)} disabled={!canPrev} aria-label="Avaliação anterior" className="flex h-11 w-11 items-center justify-center rounded-full border border-border-default bg-surface-raised text-content-secondary disabled:opacity-30 sm:hidden">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="min-w-16 text-center text-sm font-medium tabular-nums text-content-muted" aria-live="polite">{Math.min(active + 1, reviews.length)} / {reviews.length}</span>
              <button type="button" onClick={() => move(1)} disabled={!canNext} aria-label="Avaliação seguinte" className="flex h-11 w-11 items-center justify-center rounded-full border border-border-default bg-surface-raised text-content-secondary disabled:opacity-30 sm:hidden">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
