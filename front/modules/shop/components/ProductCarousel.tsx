import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Product, ProductVariant } from '../../core/types/types';
import { ProductCard } from '../../products/components/ui/ProductCard';
import { useMobile } from '../../core/hooks/useMobile';

const AUTOPLAY_MS = 4500;
const RESUME_AFTER_INTERACTION_MS = 8000;
const MAX_DOTS = 12;

/**
 * Carrossel de produtos (scroll nativo + scroll-snap):
 * - mobile: 1 produto por slide com o seguinte a "espreitar" na borda + indicadores
 * - tablet/desktop: 3–4 por vista, setas no cabeçalho
 * - autoplay: avança 1 cartão de cada vez e volta ao início no fim.
 *   Pausa quando o utilizador toca/passa o rato/usa o teclado, quando o carrossel
 *   não está visível, quando o separador está em segundo plano e se o sistema
 *   pedir "reduzir movimento".
 */
export const ProductCarousel: React.FC<{
  title: string;
  products: Product[];
  badge?: React.ReactNode;
  onAddToCart: (product: Product, variant?: ProductVariant) => void;
  onNotify?: () => void;
  currentUserName?: string;
  autoplay?: boolean;
}> = ({ title, products, badge, onAddToCart, onNotify, currentUserName, autoplay = true }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobile(640);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [active, setActive] = useState(0);

  // Estado de pausa em refs (não precisa de re-render)
  const hoverRef = useRef(false);
  const inViewRef = useRef(false);
  const pausedUntilRef = useRef(0);

  const getStep = useCallback(() => {
    const el = trackRef.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return 0;
    const gap = parseFloat(getComputedStyle(el).columnGap || '0') || 0;
    return first.offsetWidth + gap;
  }, []);

  const updateState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    const step = getStep();
    if (step > 0) {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      setActive(atEnd ? products.length - 1 : Math.round(el.scrollLeft / step));
    }
  }, [getStep, products.length]);

  useEffect(() => {
    updateState();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateState);
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => { inViewRef.current = e.isIntersecting; }, { threshold: 0.5 });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); };
  }, [updateState, products.length]);

  const pauseForInteraction = useCallback(() => {
    pausedUntilRef.current = Date.now() + RESUME_AFTER_INTERACTION_MS;
  }, []);

  // Autoplay
  useEffect(() => {
    if (!autoplay || products.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      const el = trackRef.current;
      if (!el || document.hidden || hoverRef.current || !inViewRef.current) return;
      if (Date.now() < pausedUntilRef.current) return;
      if (el.scrollWidth <= el.clientWidth + 4) return; // tudo cabe — nada para deslizar
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      if (atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
      else el.scrollBy({ left: getStep(), behavior: 'smooth' });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [autoplay, products.length, getStep]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    pauseForInteraction();
    const step = getStep() || el.clientWidth;
    const perView = Math.max(1, Math.floor((el.clientWidth + 1) / step));
    el.scrollBy({ left: dir * step * perView, behavior: 'smooth' });
  };

  if (products.length === 0) return null;

  return (
    <section
      aria-label={title}
      aria-roledescription="carrossel"
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
      onFocusCapture={pauseForInteraction}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-lg sm:text-2xl font-bold text-content-primary truncate">{title}</h2>
          {badge}
        </div>
        {/* Setas no cabeçalho (tablet/desktop) — não tapam os cartões */}
        <div className="hidden sm:flex items-center gap-2 shrink-0">
          <button
            onClick={() => scrollByPage(-1)}
            disabled={!canPrev}
            aria-label={`${title}: anteriores`}
            className="w-10 h-10 rounded-full border border-border-default bg-surface-raised flex items-center justify-center text-content-secondary hover:border-green-500 hover:text-green-700 disabled:opacity-30 disabled:pointer-events-none transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scrollByPage(1)}
            disabled={!canNext}
            aria-label={`${title}: seguintes`}
            className="w-10 h-10 rounded-full border border-border-default bg-surface-raised flex items-center justify-center text-content-secondary hover:border-green-500 hover:text-green-700 disabled:opacity-30 disabled:pointer-events-none transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={updateState}
        onPointerDown={pauseForInteraction}
        onTouchStart={pauseForInteraction}
        onWheel={pauseForInteraction}
        className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-1"
        style={{ scrollPaddingLeft: isMobile ? 16 : 0 }}
      >
        {products.map((product, i) => (
          <div
            key={product.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${products.length}`}
            className="snap-start shrink-0 w-full sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-3rem)/4)] xl:w-[calc((100%-4rem)/5)] flex"
          >
            <ProductCard
              product={product}
              onAddToCart={onAddToCart}
              onNotify={onNotify}
              isMobile={isMobile}
              horizontal={isMobile}
              index={i}
              currentUserName={currentUserName}
            />
          </div>
        ))}
      </div>

      {/* Indicadores de posição (mobile) */}
      {products.length > 1 && (
        <div className="sm:hidden flex items-center justify-center gap-1.5 mt-3" aria-hidden="true">
          {products.length <= MAX_DOTS ? (
            products.map((p, i) => (
              <span
                key={p.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-5 bg-green-600' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`}
              />
            ))
          ) : (
            <span className="text-xs font-medium text-content-muted tabular-nums">
              {active + 1} / {products.length}
            </span>
          )}
        </div>
      )}
    </section>
  );
};
