import type { Product, ProductVariant } from '../../core/types/types';

/**
 * Fonte única de verdade para preços na loja.
 * O preço mostrado no cartão/página de produto TEM de ser o mesmo que entra no carrinho.
 */

const todayISO = () => new Date().toISOString().slice(0, 10);

/** A promoção está dentro do período definido (datas YYYY-MM-DD, inclusivas)? */
export const isPromotionActive = (product: Pick<Product, 'promotionalPrice' | 'promotionalPriceStart' | 'promotionalPriceEnd'>): boolean => {
  if (!product.promotionalPrice || product.promotionalPrice <= 0) return false;
  const today = todayISO();
  if (product.promotionalPriceStart && today < product.promotionalPriceStart.slice(0, 10)) return false;
  if (product.promotionalPriceEnd && today > product.promotionalPriceEnd.slice(0, 10)) return false;
  return true;
};

/** Variante por defeito usada quando o cliente não escolhe nenhuma */
export const getDefaultVariant = (product: Product): ProductVariant | undefined =>
  product.variants?.find(v => v.isDefault) || product.variants?.[0];

/** Preço base (sem promoção) da variante escolhida ou do produto */
export const getBasePrice = (product: Product, variant?: ProductVariant | null): number =>
  (variant?.price ?? product.price ?? 0) || 0;

/** Preço promocional aplicável, ou null se não houver promoção válida */
export const getPromoPrice = (product: Product, variant?: ProductVariant | null): number | null => {
  const base = getBasePrice(product, variant);
  if (!isPromotionActive(product)) return null;
  const promo = Number(product.promotionalPrice);
  return promo < base ? promo : null;
};

/** Preço final a cobrar */
export const getEffectivePrice = (product: Product, variant?: ProductVariant | null): number =>
  getPromoPrice(product, variant) ?? getBasePrice(product, variant);

/** Percentagem de desconto (arredondada) */
export const getDiscountPercent = (product: Product, variant?: ProductVariant | null): number => {
  const promo = getPromoPrice(product, variant);
  if (promo == null) return 0;
  return Math.round((1 - promo / getBasePrice(product, variant)) * 100);
};

/** Stock disponível da variante (ou do produto, se não tiver variantes) */
export const getAvailableStock = (product: Product, variant?: ProductVariant | null): number => {
  if (variant) return variant.stock ?? 0;
  if (product.variants && product.variants.length > 0) return getDefaultVariant(product)?.stock ?? 0;
  return product.stock ?? 0;
};

/** Formata valores em Meticais — mesmo formato dos cartões de produto ("3000.00 MT") */
export const formatMT = (value: number): string => `${(Number(value) || 0).toFixed(2)} MT`;
