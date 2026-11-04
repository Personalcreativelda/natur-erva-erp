import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ShoppingCart, Star, Truck, Shield, Minus, Plus,
    RotateCcw, Check, Loader2, Package, ArrowLeft,
} from 'lucide-react';
import { Product, ProductVariant } from '../../core/types/types';
import { productService } from '../../products/services/productService';
import { getVariantImage } from '../../core/utils/productUtils';
import { useCart } from '../context/CartContext';
import { getAvailableStock, getBasePrice, getDiscountPercent, getPromoPrice, formatMT } from '../utils/pricing';
import {
    getProductRating,
    getProductReviews,
    ProductReview,
    RatingStats,
} from '../../products/services/reviewService';
import uploadService from '../../../services/uploadService';
import { ProductCarousel } from '../components/ProductCarousel';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../core/lib/queryClient';

export const ProductLandingPage: React.FC = () => {
    const { slug } = useParams<{ slug: string }>();
    const [product, setProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState<ProductVariant | undefined>(undefined);
    const [quantity, setQuantity] = useState(1);
    const [selectedTab, setSelectedTab] = useState<'description' | 'benefits' | 'usage' | 'ingredients'>('description');
    const [selectedImage, setSelectedImage] = useState('');
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const [reviews, setReviews] = useState<ProductReview[]>([]);
    const [ratingStats, setRatingStats] = useState<RatingStats | null>(null);
    // Barra de compra fixa (mobile) aparece quando o botão principal sai do ecrã
    const mainCtaRef = useRef<HTMLDivElement>(null);
    const [showStickyBar, setShowStickyBar] = useState(false);
    const [cartFeedback, setCartFeedback] = useState<'success' | 'error' | null>(null);

    const navigate = useNavigate();
    const cart = useCart();
    const queryClient = useQueryClient();
    const [cartError, setCartError] = useState<string | null>(null);

    useEffect(() => {
        const showProduct = (p: Product) => {
            setProduct(p);
            const defaultV = p.variants?.find(v => v.isDefault) || p.variants?.[0];
            setSelectedVariant(defaultV);
            setSelectedImage(getVariantImage(defaultV, p));
        };
        const loadProduct = async () => {
            if (!slug) return;
            // Abre logo com o que já está na cache da loja; o servidor confirma em segundo plano
            const cachedList = queryClient.getQueryData<Product[]>(queryKeys.shop.products);
            const cached = cachedList?.find(pr => pr.slug === slug);
            if (cached) {
                showProduct(cached);
                setRelatedProducts(cachedList!.filter(pr => pr.id !== cached.id && pr.category === cached.category).slice(0, 4));
                setLoading(false);
            } else {
                setLoading(true);
            }
            try {
                const p = await productService.getProductBySlug(slug);
                if (p) {
                    if (cached) setProduct(p); else showProduct(p);
                    const [stats, reviewList, allProducts] = await Promise.all([
                        getProductRating(p.id),
                        getProductReviews(p.id),
                        cachedList ? Promise.resolve(cachedList) : productService.getProducts(),
                    ]);
                    setRatingStats(stats);
                    setReviews(reviewList.slice(0, 5));
                    const related = allProducts
                        .filter(pr => pr.id !== p.id && pr.category === p.category && pr.showInShop)
                        .slice(0, 4);
                    setRelatedProducts(related);
                }
            } catch {
                console.error('Erro ao carregar produto');
            } finally {
                setLoading(false);
            }
        };
        loadProduct();
    }, [slug]);

    const handleAddToCart = useCallback(() => {
        if (!product) return;
        const result = cart.addItem(product, selectedVariant, quantity);
        setCartError(result.ok ? null : result.message);
        setCartFeedback(result.ok ? 'success' : 'error');
        setTimeout(() => setCartFeedback(null), 2000);
    }, [product, selectedVariant, quantity, cart]);

    // Mesmo cálculo usado no carrinho (respeita as datas da promoção)
    const basePrice = product ? getBasePrice(product, selectedVariant) : 0;
    const displayPrice = basePrice.toFixed(2);
    const promoPrice = product ? getPromoPrice(product, selectedVariant) : null;
    const promoPct = product ? getDiscountPercent(product, selectedVariant) : 0;

    const galleryImages: string[] = product
        ? [
            getVariantImage(selectedVariant, product),
            product.image,
            product.image2,
            product.image3,
            product.image4,
            ...(product.variants?.map(v => v.image).filter((img): img is string => Boolean(img)) ?? []),
        ].filter((img, i, arr) => Boolean(img) && arr.indexOf(img) === i && !img.includes('placeholder'))
        : [];

    useEffect(() => {
        const el = mainCtaRef.current;
        if (!el) return;
        const io = new IntersectionObserver(([entry]) => setShowStickyBar(!entry.isIntersecting && entry.boundingClientRect.top < 0), { threshold: 0 });
        io.observe(el);
        return () => io.disconnect();
    }, [product, loading]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-surface-base">
                <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--brand-600)' }} />
            </div>
        );
    }

    if (!product) return null;

    return (
        <div className="min-h-screen bg-surface-base">
            {/* Breadcrumb / Voltar */}
            <div className="max-w-7xl mx-auto px-4 pt-2 sm:pt-5 pb-0">
                <button
                    onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
                    className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-content-muted transition-colors group hover:opacity-80"
                    style={{ color: undefined }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-600)')}
                    onMouseLeave={e => (e.currentTarget.style.color = '')}
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                    Voltar à Loja
                </button>
            </div>

            {/* Product Section */}
            <section className="max-w-7xl mx-auto px-4 pt-2 pb-6 sm:py-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12">
                    {/* Gallery */}
                    <div>
                        <div className="bg-white rounded-2xl overflow-hidden shadow-sm mb-3 aspect-square flex items-center justify-center border border-border-default">
                            <img
                                src={selectedImage ? uploadService.getPublicUrl(selectedImage) : (galleryImages[0] ? uploadService.getPublicUrl(galleryImages[0]) : 'https://via.placeholder.com/600?text=Sem+Imagem')}
                                alt={product.name}
                                className="w-full h-full object-contain p-4 sm:p-8"
                            />
                        </div>
                        {galleryImages.length > 1 && (
                            <div className="flex gap-2 sm:gap-3 overflow-x-auto scrollbar-hide">
                                {galleryImages.slice(0, 6).map((img, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setSelectedImage(img)}
                                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0 bg-white"
                                        aria-label={`Ver imagem ${i + 1}`}
                                        style={selectedImage === img
                                            ? { borderColor: 'var(--brand-600)' }
                                            : { borderColor: 'var(--border-default, #e5e7eb)' }
                                        }
                                    >
                                        <img src={uploadService.getPublicUrl(img)} alt="" className="w-full h-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div>
                        {/* Category badge */}
                        <span
                            className="inline-block px-3 py-1 rounded-full text-xs sm:text-sm mb-2 sm:mb-3 font-medium"
                            style={{
                                background: 'color-mix(in srgb, var(--brand-600) 12%, transparent)',
                                color: 'var(--brand-600)',
                            }}
                        >
                            {product.category || 'Natural'}
                        </span>

                        <h1 className="text-2xl sm:text-4xl text-content-primary mb-2 sm:mb-3 leading-tight font-bold">{product.name}</h1>

                        {/* Stars */}
                        <div className="flex items-center gap-2 mb-4 sm:mb-5">
                            <div className="flex items-center">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star
                                        key={star}
                                        className={`w-4 h-4 sm:w-5 sm:h-5 ${star <= Math.round(ratingStats?.average ?? 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                                    />
                                ))}
                            </div>
                            <span className="text-content-muted text-sm">
                                {ratingStats && ratingStats.total > 0
                                    ? `${ratingStats.average.toFixed(1)} (${ratingStats.total} avaliações)`
                                    : 'Sem avaliações ainda'}
                            </span>
                        </div>

                        {/* Preço — uma linha, "MT" junto do valor */}
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
                            <span
                                className={`text-3xl sm:text-5xl font-bold tabular-nums ${promoPrice ? 'text-red-600 dark:text-red-400' : ''}`}
                                style={promoPrice ? undefined : { color: 'var(--brand-600)' }}
                            >
                                {formatMT(promoPrice ?? basePrice)}
                            </span>
                            {promoPrice && (
                                <>
                                    <span className="text-base sm:text-xl text-content-muted line-through tabular-nums">{displayPrice} MT</span>
                                    <span className="self-center text-xs sm:text-sm font-bold text-white bg-red-600 px-2 py-0.5 rounded-md">-{promoPct}%</span>
                                </>
                            )}
                        </div>

                        {/* Stock status indicator */}
                        {(() => {
                            const stock = getAvailableStock(product, selectedVariant);
                            if (stock <= 0) return (
                                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
                                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">Produto Esgotado</span>
                                </div>
                            );
                            if (stock <= 5) return (
                                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800">
                                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                                    <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">Últimas {stock} unidade{stock !== 1 ? 's' : ''} disponíveis</span>
                                </div>
                            );
                            return (
                                <div className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                                    <span className="w-2 h-2 rounded-full bg-green-500 shrink-0 animate-pulse" />
                                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">Em stock ({stock} disponíveis)</span>
                                </div>
                            );
                        })()}

                        <p className="text-content-secondary text-[15px] sm:text-base leading-relaxed mb-6">{product.description}</p>

                        {/* Variants */}
                        {product.variants && product.variants.length > 0 && (
                            <div className="mb-6">
                                <p className="text-content-primary mb-3 font-medium">Escolha a variação:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {product.variants.map(v => {
                                        const variantStock = v.stock ?? 0;
                                        const hasVStock = variantStock > 0;
                                        const variantImage = v.image || product.image;
                                        const variantImageUrl = variantImage ? uploadService.getPublicUrl(variantImage) : '';
                                        const isSelected = selectedVariant?.id === v.id;

                                        return (
                                            <button
                                                key={v.id}
                                                onClick={() => {
                                                    if (hasVStock) {
                                                        setSelectedVariant(v);
                                                        setSelectedImage(getVariantImage(v, product));
                                                    }
                                                }}
                                                disabled={!hasVStock}
                                                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                                                    !hasVStock ? 'border-border-default bg-surface-base opacity-60 cursor-not-allowed' : ''
                                                }`}
                                                style={isSelected
                                                    ? { borderColor: 'var(--brand-600)', background: 'color-mix(in srgb, var(--brand-600) 8%, transparent)' }
                                                    : hasVStock
                                                        ? { borderColor: 'var(--border-default, #e5e7eb)' }
                                                        : undefined
                                                }
                                            >
                                                {variantImage && (
                                                    <div className="w-16 h-16 rounded-md overflow-hidden bg-surface-base flex-shrink-0">
                                                        <img
                                                            src={variantImageUrl}
                                                            alt={v.name}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                        />
                                                    </div>
                                                )}
                                                <div className="flex-1 text-left">
                                                    <p className="font-medium text-content-primary">{v.name}</p>
                                                    <p className="text-sm font-semibold" style={{ color: 'var(--brand-600)' }}>
                                                        {formatMT(getPromoPrice(product, v) ?? getBasePrice(product, v))}
                                                        {v.unit && ` / ${v.unit}`}
                                                    </p>
                                                    <p className={`text-xs mt-0.5 font-medium ${!hasVStock ? 'text-red-500' : variantStock <= 5 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'}`}>
                                                        {!hasVStock ? 'Esgotado' : variantStock <= 5 ? `Últimas ${variantStock}` : `${variantStock} disponíveis`}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <Check className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--brand-600)' }} />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Quantidade + Adicionar */}
                        {(() => {
                            const currentStock = getAvailableStock(product, selectedVariant);
                            const hasStock = currentStock > 0;
                            return (
                                <div ref={mainCtaRef} className="border-t border-border-default pt-5 pb-6 mb-6">
                                    {hasStock ? (
                                        <div className="flex items-stretch gap-3">
                                            <div className="flex items-center border border-border-default rounded-xl overflow-hidden bg-surface-raised shrink-0" role="group" aria-label="Quantidade">
                                                <button
                                                    onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                                    disabled={quantity <= 1}
                                                    className="w-11 h-14 flex items-center justify-center hover:bg-surface-base disabled:opacity-30 transition-colors text-content-primary"
                                                    aria-label="Diminuir quantidade"
                                                >
                                                    <Minus className="w-4 h-4" />
                                                </button>
                                                <span className="w-10 text-center font-semibold tabular-nums text-content-primary" aria-live="polite">{quantity}</span>
                                                <button
                                                    onClick={() => setQuantity(q => Math.min(currentStock, q + 1))}
                                                    disabled={quantity >= currentStock}
                                                    className="w-11 h-14 flex items-center justify-center hover:bg-surface-base disabled:opacity-30 transition-colors text-content-primary"
                                                    aria-label="Aumentar quantidade"
                                                >
                                                    <Plus className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <button
                                                onClick={handleAddToCart}
                                                disabled={cartFeedback !== null}
                                                className="flex-1 min-w-0 h-14 rounded-xl flex items-center justify-center gap-2 font-semibold transition-all text-white px-3"
                                                style={{
                                                    background: cartFeedback === 'error' ? '#dc2626' : 'var(--brand-600)',
                                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -12px var(--brand-600)',
                                                }}
                                            >
                                                {cartFeedback === 'success' ? (
                                                    <><Check className="w-5 h-5 shrink-0" /> Adicionado!</>
                                                ) : cartFeedback === 'error' ? (
                                                    <span className="truncate">{cartError || 'Stock insuficiente'}</span>
                                                ) : (
                                                    <><ShoppingCart className="w-5 h-5 shrink-0" /> <span className="truncate"><span className="sm:hidden">Adicionar</span><span className="hidden sm:inline">Adicionar ao carrinho</span></span></>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            disabled
                                            className="w-full h-14 bg-surface-base text-content-muted rounded-xl flex items-center justify-center gap-2 cursor-not-allowed font-semibold border border-border-default"
                                        >
                                            <Package className="w-5 h-5" />
                                            Produto esgotado
                                        </button>
                                    )}
                                    {cartFeedback === 'success' && (
                                        <button onClick={cart.open} className="mt-3 w-full h-11 rounded-xl border border-border-default text-content-secondary font-medium hover:bg-surface-raised transition">
                                            Ver carrinho
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Benefit boxes */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
                            {[
                                { icon: Truck, title: 'Entrega Rápida', sub: 'Todo o país' },
                                { icon: Shield, title: '100% Natural', sub: 'Certificado' },
                                { icon: RotateCcw, title: 'Garantia', sub: '30 dias' },
                            ].map(({ icon: Icon, title, sub }) => (
                                <div
                                    key={title}
                                    className="text-center px-2 py-3 sm:p-4 rounded-xl"
                                    style={{ background: 'color-mix(in srgb, var(--brand-600) 8%, transparent)' }}
                                >
                                    <Icon className="w-6 h-6 mx-auto mb-1" style={{ color: 'var(--brand-600)' }} />
                                    <p className="text-xs font-medium text-content-primary">{title}</p>
                                    <p className="text-xs text-content-muted">{sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Product info checklist */}
                        <div className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-border-default">
                            <h3 className="text-base font-semibold text-content-primary mb-3">Informações do Produto</h3>
                            <ul className="space-y-2">
                                {([
                                    '100% natural e sem aditivos artificiais',
                                    'Selecionado e testado com rigor de qualidade',
                                    'Produção sustentável e responsável',
                                    `Categoria: ${product.category || 'Natural'}`,
                                    product.variants && product.variants.length > 0
                                        ? `${product.variants.length} variantes disponíveis`
                                        : null,
                                ] as (string | null)[])
                                    .filter((item): item is string => item !== null)
                                    .map((item, i) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-600)' }} />
                                            <span className="text-content-secondary text-sm">{item}</span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Tabs Section */}
            <section className="max-w-7xl mx-auto px-4 py-6 sm:py-10">
                <div className="bg-surface-raised rounded-2xl shadow-sm overflow-hidden border border-border-default">
                    <div className="border-b border-border-default flex overflow-x-auto scrollbar-hide">
                        {(
                            [
                                { key: 'description', label: 'Descrição' },
                                { key: 'benefits', label: 'Benefícios' },
                                { key: 'usage', label: 'Como usar' },
                                { key: 'ingredients', label: 'Ingredientes' },
                            ] as const
                        ).map(({ key, label }) => (
                            <button
                                key={key}
                                onClick={() => setSelectedTab(key)}
                                className="shrink-0 px-4 sm:px-7 py-4 text-sm whitespace-nowrap transition-colors font-medium"
                                role="tab"
                                aria-selected={selectedTab === key}
                                style={selectedTab === key
                                    ? { borderBottom: '2px solid var(--brand-600)', color: 'var(--brand-600)', marginBottom: '-1px' }
                                    : { color: 'var(--text-secondary, #4b5563)' }
                                }
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="p-4 sm:p-8">
                        {selectedTab === 'description' && (
                            <p className="text-content-secondary leading-relaxed whitespace-pre-line">
                                {(product as any).descriptionLong || (product as any).description || 'Sem descrição disponível.'}
                            </p>
                        )}
                        {selectedTab === 'benefits' && (
                            (product as any).benefits ? (
                                <div className="space-y-3">
                                    {((product as any).benefits as string).split('\n').filter((l: string) => l.trim()).map((line: string, i: number) => (
                                        <div key={i} className="flex items-start gap-2">
                                            <Check className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--brand-600)' }} />
                                            <span className="text-content-secondary text-sm">{line.trim()}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-content-muted text-sm">Sem informação de benefícios disponível.</p>
                            )
                        )}
                        {selectedTab === 'usage' && (
                            (product as any).howToUse ? (
                                <ol className="space-y-4">
                                    {((product as any).howToUse as string).split('\n').filter((l: string) => l.trim()).map((step: string, i: number) => (
                                        <li key={i} className="flex gap-4 items-start">
                                            <span
                                                className="flex-shrink-0 w-8 h-8 text-white rounded-full flex items-center justify-center text-sm font-bold"
                                                style={{ background: 'var(--brand-600)' }}
                                            >
                                                {i + 1}
                                            </span>
                                            <p className="text-content-secondary pt-1 text-sm leading-relaxed">{step.trim()}</p>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-content-muted text-sm">Sem instruções de uso disponíveis.</p>
                            )
                        )}
                        {selectedTab === 'ingredients' && (
                            (product as any).ingredients ? (
                                <p className="text-content-secondary leading-relaxed whitespace-pre-line">
                                    {(product as any).ingredients}
                                </p>
                            ) : (
                                <p className="text-content-muted text-sm">Sem lista de ingredientes disponível.</p>
                            )
                        )}
                    </div>
                </div>
            </section>

            {/* Reviews Section */}
            <section className="max-w-7xl mx-auto px-4 py-4 sm:py-10">
                <div className="bg-surface-raised rounded-2xl shadow-sm p-5 sm:p-8 border border-border-default">
                    <h2 className="text-lg sm:text-2xl font-semibold text-content-primary mb-4 sm:mb-6">Avaliações de Clientes</h2>
                    {ratingStats && ratingStats.total > 0 ? (
                        <>
                            <div className="flex flex-col sm:flex-row items-start gap-5 sm:gap-8 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-border-default">
                                <div className="text-center flex-shrink-0">
                                    <div className="text-5xl font-bold text-content-primary mb-1">{ratingStats.average.toFixed(1)}</div>
                                    <div className="flex justify-center mb-1">
                                        {[1, 2, 3, 4, 5].map(star => (
                                            <Star key={star} className={`w-4 h-4 ${star <= Math.round(ratingStats.average) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                        ))}
                                    </div>
                                    <p className="text-content-muted text-xs">{ratingStats.total} avaliações</p>
                                </div>
                                <div className="flex-1 w-full">
                                    {[5, 4, 3, 2, 1].map(star => {
                                        const count = reviews.filter(r => r.rating === star).length;
                                        const pct = ratingStats.total > 0 ? Math.round((count / ratingStats.total) * 100) : 0;
                                        return (
                                            <div key={star} className="flex items-center gap-3 mb-1.5">
                                                <span className="text-xs text-content-muted w-6">{star}★</span>
                                                <div className="flex-1 h-2 bg-surface-base rounded-full overflow-hidden">
                                                    <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs text-content-muted w-5">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-6">
                                {reviews.map((review, i) => (
                                    <div key={review.id || i} className="border-b border-border-default pb-5 last:border-0">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white"
                                                    style={{ background: 'var(--brand-600)' }}
                                                >
                                                    {(review.user_name?.[0] ?? '?').toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-medium text-content-primary text-sm">{review.user_name}</p>
                                                    <div className="flex">
                                                        {[1, 2, 3, 4, 5].map(star => (
                                                            <Star key={star} className={`w-3.5 h-3.5 ${star <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <span className="text-xs text-content-muted">{new Date(review.created_at).toLocaleDateString('pt-PT')}</span>
                                        </div>
                                        <p className="text-content-secondary text-sm leading-relaxed pl-13">{review.comment}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-10">
                            <Package className="w-12 h-12 text-content-muted mx-auto mb-3 opacity-40" />
                            <p className="text-content-muted">Ainda não há avaliações para este produto.</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Related Products */}
            {relatedProducts.length > 0 && (
                <section className="max-w-7xl mx-auto px-4 sm:px-12 py-10">
                    <ProductCarousel
                        title="Produtos Relacionados"
                        products={relatedProducts}
                        onAddToCart={(p, v) => { if (cart.addItem(p, v, 1).ok) cart.open(); }}
                    />
                </section>
            )}

            {/* Barra fixa de compra — mobile, quando o botão principal já não está visível */}
            {showStickyBar && getAvailableStock(product, selectedVariant) > 0 && (
                <div
                    className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-raised/95 backdrop-blur-xl border-t border-border-default px-4 pt-3 animate-fade-in-up"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))', boxShadow: '0 -8px 24px -12px rgba(48,49,61,0.2)' }}
                >
                    <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                            <p className="text-xs text-content-muted truncate">{product.name}</p>
                            <p className={`text-lg font-bold tabular-nums ${promoPrice ? 'text-red-600 dark:text-red-400' : 'text-content-primary'}`}>
                                {formatMT((promoPrice ?? basePrice) * quantity)}
                            </p>
                        </div>
                        <button
                            onClick={handleAddToCart}
                            disabled={cartFeedback !== null}
                            className="shrink-0 h-12 px-5 rounded-xl text-white font-semibold flex items-center gap-2"
                            style={{ background: cartFeedback === 'error' ? '#dc2626' : 'var(--brand-600)' }}
                        >
                            {cartFeedback === 'success' ? <><Check className="w-5 h-5" /> Adicionado</> : <><ShoppingCart className="w-5 h-5" /> Adicionar</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
