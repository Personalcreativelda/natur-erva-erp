import React, { useEffect, useMemo, useState } from 'react';
import { Check, ImageOff, Search, ShoppingBag, Tag } from 'lucide-react';
import api from '../../../core/services/apiClient';

/** Produto para a montra (GET /api/marketing/products — backend/services/productShowcase.js). */
export interface ShowcaseProduct {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  price: number;
  promoPrice: number | null;
  isPromo: boolean;
  discountPercent: number;
  url: string;
}

export const fmtMT = (n: number) => `${Number(n || 0).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

let cache: ShowcaseProduct[] | null = null;

export function useShowcaseProducts() {
  const [products, setProducts] = useState<ShowcaseProduct[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    api.get<ShowcaseProduct[]>('/marketing/products')
      .then(list => { cache = list; setProducts(list); })
      .catch(() => setProducts([]));
  }, []);
  return products;
}

/**
 * Escolha de produtos para a montra (email: grelha com fotos; WhatsApp: fotos com legenda).
 * Promoções aparecem primeiro; "Só promoções" filtra.
 */
export const ProductShowcasePicker: React.FC<{
  selected: string[];
  onChange: (ids: string[]) => void;
  max: number;
  hint?: string;
}> = ({ selected, onChange, max, hint }) => {
  const products = useShowcaseProducts();
  const [query, setQuery] = useState('');
  const [promoOnly, setPromoOnly] = useState(false);

  const promoCount = products?.filter(p => p.isPromo).length || 0;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || []).filter(p => (!promoOnly || p.isPromo) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, query, promoOnly]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else if (selected.length < max) onChange([...selected, id]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-content-secondary">
          <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" /> Montra de produtos
          <span className="text-content-muted">({selected.length}/{max})</span>
        </p>
        {promoCount > 0 && (
          <button type="button" onClick={() => onChange((products || []).filter(p => p.isPromo).slice(0, max).map(p => p.id))}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/20">
            <Tag className="h-3 w-3" aria-hidden="true" /> Usar as {Math.min(promoCount, max)} promoções
          </button>
        )}
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-content-muted hover:text-content-primary">Limpar</button>
        )}
      </div>
      {hint && <p className="text-xs text-content-muted">{hint}</p>}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-muted" aria-hidden="true" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Procurar produto…" aria-label="Procurar produto"
            className="w-full rounded-lg border border-border-default bg-surface-base py-1.5 pl-8 pr-3 text-sm text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-content-secondary">
          <input type="checkbox" checked={promoOnly} onChange={e => setPromoOnly(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Só promoções
        </label>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Produtos">
        {products === null ? (
          <p className="py-6 text-xs text-content-muted">A carregar produtos…</p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-xs text-content-muted">{promoOnly ? 'Não há produtos em promoção neste momento.' : 'Nenhum produto encontrado.'}</p>
        ) : visible.map(p => {
          const on = selected.includes(p.id);
          const disabled = !on && selected.length >= max;
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} disabled={disabled} aria-pressed={on}
              className={`relative w-28 shrink-0 rounded-xl border p-1.5 text-left transition-colors disabled:opacity-40 ${on ? 'border-brand-600 ring-2 ring-brand-600/30' : 'border-border-default hover:border-brand-500'}`}>
              <div className="flex h-20 items-center justify-center overflow-hidden rounded-lg bg-white">
                {p.image ? <img src={p.image} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff className="h-6 w-6 text-content-muted" aria-hidden="true" />}
              </div>
              {p.isPromo && p.discountPercent > 0 && (
                <span className="absolute left-2 top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">-{p.discountPercent}%</span>
              )}
              {on && (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              )}
              <p className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-content-primary">{p.name}</p>
              <p className={`text-[11px] font-semibold tabular-nums ${p.isPromo ? 'text-red-600 dark:text-red-400' : 'text-content-secondary'}`}>
                {fmtMT(p.isPromo ? (p.promoPrice as number) : p.price)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ProductShowcasePicker;
