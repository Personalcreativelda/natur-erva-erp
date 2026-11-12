import React, { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Product, ProductVariant } from '../../../core/types/types';
import { ShoppingCart, Package, X, Star, TrendingUp } from 'lucide-react';
import { getVariantImage } from '../../../core/utils/productUtils';
import { StarRating } from './StarRating';
import { ReviewModal } from './ReviewModal';
import { getProductRating, RatingStats } from '../../services/reviewService';
import { getAvailableStock, getBasePrice, getDiscountPercent, getPromoPrice } from '../../../shop/utils/pricing';

export const ProductCardSkeleton: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
 return (
 <div className="bg-surface-raised rounded-2xl overflow-hidden border border-border-default shadow-sm" aria-hidden="true">
 <div className="w-full aspect-square bg-surface-base animate-pulse" />
 <div className={`${isMobile ? 'p-2.5' : 'p-4'} space-y-2.5`}>
 {!isMobile && <div className="h-3 bg-surface-base rounded animate-pulse w-1/3" />}
 <div className="h-4 bg-surface-base rounded animate-pulse w-11/12" />
 <div className="h-4 bg-surface-base rounded animate-pulse w-2/3" />
 {!isMobile && <div className="h-5 bg-surface-base rounded animate-pulse w-1/2 mt-3" />}
 {isMobile
 ? <div className="flex justify-between items-end"><div className="h-4 bg-surface-base rounded animate-pulse w-1/2" /><div className="w-10 h-10 bg-surface-base rounded-full animate-pulse" /></div>
 : <div className="h-11 bg-surface-base rounded-xl animate-pulse w-full" />}
 </div>
 </div>
 );
};

const ProductCardComponent: React.FC<{
 product: Product;
 onAddToCart: (product: Product, variant?: ProductVariant) => void;
 onNotify?: () => void;
 index?: number;
 isMobile?: boolean;
 showFeaturedBadge?: boolean;
 currentUserName?: string;
 /** Cartão deitado (foto à esquerda) — carrosséis no mobile, 1 produto por slide */
 horizontal?: boolean;
}> = ({ product, onAddToCart, onNotify, index = 0, isMobile = false, showFeaturedBadge = false, currentUserName, horizontal = false }) => {
 const availableVariants = useMemo(() =>
 product.variants?.filter(v => v.stock > 0) || [],
 [product.variants]
 );

 const defaultVariant = useMemo(() =>
 product.variants?.find(v => v.isDefault && v.stock > 0) || availableVariants[0] || product.variants?.[0],
 [product.variants, availableVariants]
 );

 const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(defaultVariant);
 const [showVariantModal, setShowVariantModal] = useState(false);
 const [modalSelectedVariant, setModalSelectedVariant] = useState<ProductVariant | undefined>(defaultVariant);
 const [showReviewModal, setShowReviewModal] = useState(false);
 const [ratingStats, setRatingStats] = useState<RatingStats>({ average: 0, total: 0 });
 const hasVariants = product.variants && product.variants.length > 0;
 const hasTrackedViewRef = useRef(false);

 useEffect(() => {
 getProductRating(product.id).then(setRatingStats);
 }, [product.id]);

 useEffect(() => {
 const variantWithStock = availableVariants.length > 0
 ? availableVariants[0]
 : product.variants?.[0];
 setSelectedVariant(variantWithStock || defaultVariant);
 }, [product.id, availableVariants, defaultVariant]);

 useEffect(() => {
 if (hasTrackedViewRef.current) return;
 const observer = new IntersectionObserver(
 (entries) => {
 entries.forEach((entry) => {
 if (entry.isIntersecting && !hasTrackedViewRef.current) {
 hasTrackedViewRef.current = true;
 // @ts-ignore
 if (window.__trackProductView) {
 // @ts-ignore
 window.__trackProductView(product.id, product.name);
 }
 }
 });
 },
 { threshold: 0.5 }
 );
 const cardElement = document.querySelector(`[data-product-id="${product.id}"]`);
 if (cardElement) observer.observe(cardElement);
 return () => { if (cardElement) observer.unobserve(cardElement); };
 }, [product.id, product.name]);

 const handleAddToCart = () => {
 if (hasVariants && availableVariants.length > 1) {
 setModalSelectedVariant(availableVariants[0]);
 setShowVariantModal(true);
 } else {
 onAddToCart(product, selectedVariant);
 }
 };

 const handleConfirmAddFromModal = () => {
 if (modalSelectedVariant) {
 onAddToCart(product, modalSelectedVariant);
 setShowVariantModal(false);
 }
 };

 // Mesmo cálculo que o carrinho usa — o preço mostrado é o preço cobrado
 const currentPrice = getBasePrice(product, selectedVariant);
 const promoPrice = getPromoPrice(product, selectedVariant);
 const discountPct = getDiscountPercent(product, selectedVariant);
 const currentStock = getAvailableStock(product, selectedVariant);
 const hasStock = currentStock > 0;
 const isLowStock = hasStock && currentStock <= 5;
 const displayName = selectedVariant?.name ? `${product.name} - ${selectedVariant.name}` : product.name;

 return (
 <div
 data-product-id={product.id}
 className={`w-full bg-surface-raised rounded-2xl overflow-hidden border border-border-default shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 group flex ${horizontal ? 'flex-row' : 'flex-col'}`}
 style={{ animationDelay: `${index * 50}ms` }}
 >
 {/* Imagem — quadrada para todos os cartões terem a mesma altura */}
 <Link to={`/loja/produto/${product.slug}`} className={`block relative overflow-hidden flex-shrink-0 ${horizontal ? 'w-[40%] border-r border-border-default/60' : ''}`} tabIndex={-1} aria-hidden="true">
 <div className={`relative w-full bg-white dark:bg-surface-base ${horizontal ? 'h-full min-h-[148px]' : 'aspect-square'}`}>
 {(() => {
 const imageUrl = getVariantImage(selectedVariant, product);
 return imageUrl && !imageUrl.includes('placeholder') ? (
 <img
 src={imageUrl}
 alt={displayName}
 className={`w-full h-full object-contain ${isMobile ? 'p-2' : 'p-3'} group-hover:scale-105 transition-transform duration-500 ease-out`}
 loading="lazy"
 onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
 />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Package className="w-14 h-14 opacity-20" style={{ color: 'var(--brand-600)' }} />
 </div>
 );
 })()}

 {/* Selo de desconto (a categoria passou para o texto — antes os dois selos sobrepunham-se) */}
 {promoPrice ? (
 <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-red-600 text-white text-[11px] font-bold leading-tight shadow-sm">
 -{discountPct}%
 </span>
 ) : showFeaturedBadge && (
 <span className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-amber-900 text-[11px] font-bold leading-none shadow-sm bg-amber-400">
 <Star className="w-3 h-3 fill-current" />
 Destaque
 </span>
 )}

 {/* Stock */}
 {!hasStock && (
 <div className="absolute inset-0 bg-white/60 dark:bg-black/50 flex items-center justify-center">
 <span className="text-white font-semibold text-xs px-3 py-1.5 bg-gray-900/85 rounded-full">Esgotado</span>
 </div>
 )}
 {isLowStock && (
 <span className="absolute bottom-1.5 left-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-orange-500/95 text-white leading-tight">
 {currentStock === 1 ? 'Última unidade' : `Últimas ${currentStock}`}
 </span>
 )}
 </div>
 </Link>

 {/* Conteúdo — mobile compacto (estilo app Android) / desktop completo */}
 {isMobile ? (
 <div className={`flex flex-col flex-1 min-w-0 gap-1 ${horizontal ? 'p-3' : 'px-2.5 pt-2 pb-2.5'}`}>
 {horizontal && product.category && (
 <p className="text-[11px] font-medium text-content-muted truncate">{product.category}</p>
 )}
 <Link to={`/loja/produto/${product.slug}`} className="block !min-h-0" style={{ color: 'inherit' }}>
 <h3 className={`${horizontal ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'} text-content-primary leading-snug line-clamp-2`}>
 {product.name}
 </h3>
 </Link>

 {(ratingStats.total > 0 || (product.totalSold || 0) > 0) && (
 <div className="flex items-center gap-1.5 text-[11px] text-content-muted leading-none">
 {ratingStats.total > 0 && (
 <span className="flex items-center gap-0.5">
 <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
 {ratingStats.average.toFixed(1)}
 </span>
 )}
 {ratingStats.total > 0 && (product.totalSold || 0) > 0 && <span aria-hidden="true">·</span>}
 {(product.totalSold || 0) > 0 && (
 <span>{product.totalSold! >= 1000 ? `${(product.totalSold! / 1000).toFixed(1)}k` : product.totalSold} {product.totalSold === 1 ? 'vendido' : 'vendidos'}</span>
 )}
 </div>
 )}

 {/* Preço + botão de carrinho na mesma linha */}
 <div className="mt-auto pt-1 flex items-end justify-between gap-1.5">
 <div className="min-w-0 leading-tight">
 {promoPrice && (
 <span className="block text-[11px] text-content-muted line-through tabular-nums">{currentPrice.toFixed(2)} MT</span>
 )}
 <span
 className={`block text-[15px] font-bold tabular-nums whitespace-nowrap ${promoPrice ? 'text-red-600 dark:text-red-400' : ''}`}
 style={promoPrice ? undefined : { color: 'var(--brand-600)' }}
 >
 {(promoPrice ?? currentPrice).toFixed(2)} MT
 </span>
 </div>
 {hasStock ? (
 <button
 onClick={handleAddToCart}
 className="tap-target shrink-0 w-10 h-10 !min-h-0 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
 style={{ background: 'var(--brand-600)', boxShadow: '0 4px 10px -4px var(--brand-600)' }}
 aria-label={`Adicionar ${product.name} ao carrinho`}
 >
 <ShoppingCart className="w-[18px] h-[18px]" />
 </button>
 ) : (
 <span className="shrink-0 text-[11px] font-semibold text-content-muted">Esgotado</span>
 )}
 </div>
 </div>
 ) : (
 <div className="p-3 flex flex-col flex-1 border-t border-border-default/60">
 {product.category && (
 <p className="text-[11px] font-medium text-content-muted truncate mb-1">{product.category}</p>
 )}

 <Link to={`/loja/produto/${product.slug}`} className="block mb-1.5" style={{ color: 'inherit' }}>
 <h3 className="text-sm min-h-[2.5em] font-semibold text-content-primary leading-tight line-clamp-2 hover:opacity-80 transition-opacity">
 {product.name}
 </h3>
 </Link>

 {/* Estrelas só quando há avaliações — 5 estrelas vazias parecem "nota zero" */}
 <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mb-1 min-h-[16px]">
 {ratingStats.total > 0 && (
 <button
 type="button"
 onClick={() => setShowReviewModal(true)}
 className="flex items-center gap-1 !min-h-0 p-0 border-0 bg-transparent"
 aria-label={`Avaliação ${ratingStats.average.toFixed(1)} de 5, ${ratingStats.total} avaliações`}
 >
 <StarRating value={ratingStats.average} size="sm" />
 <span className="text-[11px] text-content-muted">({ratingStats.total})</span>
 </button>
 )}
 {(product.totalSold || 0) > 0 && (
 <span className="flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
 <TrendingUp className="w-3 h-3" />
 {product.totalSold! >= 1000 ? `${(product.totalSold! / 1000).toFixed(1)}k` : product.totalSold} {product.totalSold === 1 ? 'vendido' : 'vendidos'}
 </span>
 )}
 </div>


 <div className="mt-auto pt-1 flex flex-col gap-2">
 <div className="leading-tight">
 <span className={`block text-xs text-content-muted line-through tabular-nums ${promoPrice ? '' : 'invisible'}`} aria-hidden={!promoPrice}>
 {currentPrice.toFixed(2)} MT
 </span>
 <span
 className={`block text-base font-bold tabular-nums ${promoPrice ? 'text-red-600 dark:text-red-400' : ''}`}
 style={promoPrice ? undefined : { color: 'var(--brand-600)' }}
 >
 {(promoPrice ?? currentPrice).toFixed(2)} MT
 </span>
 </div>

 {hasStock ? (
 <button
 onClick={handleAddToCart}
 className="w-full flex items-center justify-center gap-2 h-10 rounded-xl text-white text-[13px] font-semibold transition-all duration-150 active:scale-[0.97] hover:opacity-90"
 style={{ background: 'var(--brand-600)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}
 aria-label={`Adicionar ${product.name} ao carrinho`}
 >
 <ShoppingCart className="w-4 h-4 flex-shrink-0" />
 Adicionar ao carrinho
 </button>
 ) : (
 <button
 disabled
 className="w-full flex items-center justify-center h-10 rounded-xl text-content-muted text-[13px] font-semibold border border-border-default bg-surface-base cursor-not-allowed"
 >
 Esgotado
 </button>
 )}
 </div>
 </div>
 )}

 {/* Modal de variante — Portal */}
 {showVariantModal && typeof document !== 'undefined' && createPortal(
 <>
 <div
 className="fixed inset-0 min-h-screen min-w-full z-[100] modal-overlay"
 onClick={() => setShowVariantModal(false)}
 aria-hidden="true"
 />
 <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
 <div
 className="relative w-full max-w-sm max-h-[90vh] overflow-hidden rounded-2xl bg-surface-raised shadow-xl flex flex-col border border-border-default"
 onClick={(e) => e.stopPropagation()}
 >
 <div className="flex items-center justify-between p-4 border-b border-border-default">
 <h3 className="text-lg font-semibold text-content-primary">Escolher variante</h3>
 <button
 onClick={() => setShowVariantModal(false)}
 className="tap-target p-2 rounded-lg text-content-muted hover:bg-surface-base transition-colors"
 aria-label="Fechar"
 >
 <X className="h-5 w-5" />
 </button>
 </div>
 <div className="p-4 overflow-y-auto">
 <div className="flex gap-4 mb-4">
 <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-surface-base">
 {(() => {
 const imgUrl = getVariantImage(modalSelectedVariant, product);
 return imgUrl && !imgUrl.includes('placeholder') ? (
 <img src={imgUrl} alt={product.name} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center">
 <Package className="w-8 h-8 text-content-muted" />
 </div>
 );
 })()}
 </div>
 <div className="flex-1 min-w-0">
 <h4 className="font-medium text-content-primary truncate">{product.name}</h4>
 </div>
 </div>
 <p className="text-sm text-content-muted mb-3">Selecione a opção desejada:</p>
 <div className="space-y-2">
 {availableVariants.map((v) => (
 <button
 key={v.id}
 onClick={() => setModalSelectedVariant(v)}
 className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-colors border-2 ${
 modalSelectedVariant?.id === v.id
 ? 'text-content-primary'
 : 'border-border-default bg-surface-base hover:bg-surface-raised text-content-secondary'
 }`}
 style={modalSelectedVariant?.id === v.id ? {
 borderColor: 'var(--brand-600)',
 background: 'color-mix(in srgb, var(--brand-600) 8%, transparent)'
 } : undefined}
 >
 <span className="font-medium">{v.name}</span>
 <span className="text-sm font-semibold" style={{ color: 'var(--brand-600)' }}>
 {v.price.toFixed(2)} MT
 </span>
 </button>
 ))}
 </div>
 </div>
 <div className="p-4 border-t border-border-default flex gap-3">
 <button
 onClick={() => setShowVariantModal(false)}
 className="flex-1 px-4 py-2.5 rounded-xl border border-border-default text-content-secondary font-medium hover:bg-surface-base transition-colors"
 >
 Cancelar
 </button>
 <button
 onClick={handleConfirmAddFromModal}
 disabled={!modalSelectedVariant}
 className="flex-1 px-4 py-2.5 rounded-xl text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
 style={{ background: 'var(--brand-600)' }}
 >
 <ShoppingCart className="h-4 w-4" />
 Adicionar ao carrinho
 </button>
 </div>
 </div>
 </div>
 </>,
 document.body
 )}

 {/* Modal de avaliações */}
 {showReviewModal && (
 <ReviewModal
 productId={product.id}
 productName={product.name}
 currentUserName={currentUserName}
 onClose={() => setShowReviewModal(false)}
 onStatsChange={setRatingStats}
 />
 )}
 </div>
 );
};

export const ProductCard = memo(ProductCardComponent, (prevProps, nextProps) => {
 const prevStock = prevProps.product.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? prevProps.product.stock ?? 0;
 const nextStock = nextProps.product.variants?.reduce((s, v) => s + (v.stock ?? 0), 0) ?? nextProps.product.stock ?? 0;
 return (
 prevProps.product.id === nextProps.product.id &&
 prevProps.product.price === nextProps.product.price &&
 prevProps.product.promotionalPrice === nextProps.product.promotionalPrice &&
 prevStock === nextStock &&
 prevProps.isMobile === nextProps.isMobile &&
 prevProps.showFeaturedBadge === nextProps.showFeaturedBadge &&
 prevProps.onAddToCart === nextProps.onAddToCart
 );
});
