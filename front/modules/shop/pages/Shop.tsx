import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Product, ProductVariant, OrderItem, OrderStatus } from '../../core/types/types';
import { authService } from '../../auth/services/authService';
import { applyDarkModeVars, removeDarkModeVars } from '../../core/utils/theme';
import { productService } from '../../products/services/productService';
import api from '../../core/services/apiClient';
import { orderService } from '../../sales/services/orderService';
import { useShopTracking } from '../../core/hooks/useShopTracking';
import { useMobile } from '../../core/hooks/useMobile';
import { ShoppingCart, Search, User, Package, X, MapPin, CheckCircle, Loader2, ChevronRight, Leaf, Droplet, Pill, Heart, Sparkles, Tag, Gift, Users, TrendingUp, XCircle, Copy, Check, Truck, ArrowUpDown, ChevronDown } from 'lucide-react';
import { User as UserType } from '../../core/types/types';
import { ToastContainer, Toast } from '../../core/components/ui/Toast';
import { DeliveryZoneSelector } from '../../core/components/forms/DeliveryZoneSelector';
import { LoginModal } from '../../core/components/modals/LoginModal';
import { ProductCard, ProductCardSkeleton } from '../../products/components/ui/ProductCard';
import { getSystemSettings, SystemSettings } from '../../core/services/systemSettingsService';
import { useShopContext } from '../../../contexts/ShopContext';
import { normalizeForSearch } from '../../core/services/serviceUtils';
import { ShopBanner } from '../components/ShopBanner';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../core/lib/queryClient';
import { useShopProducts, useShopCategories, useShopBlog, useShopSettings, useCategoryImages } from '../hooks/useShopData';
import { uploadProductImage } from '../../../services/uploadService';
import { FAQSection } from '../components/FAQSection';
import { ProductCarousel } from '../components/ProductCarousel';
import { TestimonialsSection } from '../components/TestimonialsSection';
import { ShopInstagram } from '../components/ShopInstagram';
import { ShopMidBanner } from '../components/ShopMidBanner';
import { InlineAdBanner } from '../components/InlineAdBanner';
import { useCart, CartItem } from '../context/CartContext';
import { formatMT, getBasePrice, getPromoPrice } from '../utils/pricing';

const DEFAULT_WHATSAPP = '258874209440';

type AppliedCoupon = { type: string; value: number; discountAmount: number; code: string };

interface DeliveryInfo {
  isDelivery: boolean;
  address: string;
  phone: string;
  email: string;
  name: string;
  deliveryZoneId: string;
  deliveryZoneName: string;
  deliveryFee: number;
}

interface OrderConfirmation {
  orderNumber: string;
  trackingCode?: string | null;
  total: number;
  isDelivery: boolean;
}

interface ShopProps {
  currentUser?: UserType | null;
  onLogin?: (user: UserType) => void;
  onLogout?: () => void;
}

const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_LIST: any[] = [];
const EMPTY_SETTINGS: SystemSettings = {};

const SORT_OPTIONS = [
  { value: 'popular', label: 'Mais populares' },
  { value: 'newest', label: 'Mais recentes' },
  { value: 'price_asc', label: 'Menor preço' },
  { value: 'price_desc', label: 'Maior preço' },
  { value: 'name_asc', label: 'Nome A-Z' },
];

const CATEGORY_ICONS = [Leaf, Droplet, Pill, Heart, Sparkles, Tag];

/** Produtos mostrados por lote na grelha ("Ver mais" carrega o próximo lote) */
/**
 * Colunas da grelha de produtos (iguais às classes de gridClass) e tamanho dos blocos
 * entre banners — sempre linhas completas: 2×4, 3×3, 4×2, 5×2.
 */
const gridColumnsFor = (w: number) => (w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2);
const chunkSizeFor = (cols: number) => cols * (cols === 2 ? 4 : cols === 3 ? 3 : 2);
const useGridColumns = () => {
  const [cols, setCols] = useState(() => (typeof window === 'undefined' ? 2 : gridColumnsFor(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setCols(gridColumnsFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
};

/** Telefone com menos de 8 dígitos = perfil incompleto (a equipa confirma pedidos por telefone) */
const needsProfileCompletion = (user: UserType | null): boolean => {
  if (!user) return false;
  return (user.phone?.replace(/\D/g, '') || '').length < 8;
};

/** Preço mínimo para ordenar/filtrar — usa o mesmo preço que o cliente vê */
const getListingPrice = (p: Product): number => {
  if (p.variants && p.variants.length > 0) {
    return Math.min(...p.variants.map(v => getPromoPrice(p, v) ?? getBasePrice(p, v)));
  }
  return getPromoPrice(p) ?? getBasePrice(p);
};

export const Shop: React.FC<ShopProps> = ({ currentUser: propCurrentUser, onLogin, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isMobile = useMobile(768);
  const shopContext = useShopContext();
  const cart = useCart();

  // ── Estado ────────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<UserType | null>(propCurrentUser || null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showCompleteProfile, setShowCompleteProfile] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);

  // Dados com cache persistente: aparecem logo e actualizam-se em segundo plano (sem recarregar a página)
  const queryClient = useQueryClient();
  const productsQuery = useShopProducts();
  const products = productsQuery.data ?? EMPTY_PRODUCTS;
  // Esqueletos só na primeira visita (sem nada em cache)
  const loading = productsQuery.isPending;
  const categories = useShopCategories().data ?? EMPTY_LIST;
  const blogPosts = useShopBlog().data ?? EMPTY_LIST;
  const settings: SystemSettings = useShopSettings().data ?? EMPTY_SETTINGS;
  const categoryImage = useCategoryImages(products);

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => searchParams.get('categoria') || 'all');
  const [sortOrder, setSortOrder] = useState<string>('popular');
  const gridCols = useGridColumns();
  const CHUNK = chunkSizeFor(gridCols);
  const PAGE_SIZE = CHUNK * 2; // 16 / 18 / 16 / 20 produtos por página
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [blogSlide, setBlogSlide] = useState(0);

  const [darkMode, setDarkMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [trackingInput, setTrackingInput] = useState('');

  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo>({
    isDelivery: false, address: '', phone: '', email: '', name: '',
    deliveryZoneId: '', deliveryZoneName: '', deliveryFee: 0,
  });

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes((currentUser as any)?.role || '');
  const productsSectionRef = useRef<HTMLElement>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: Toast['type'] = 'info', duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const scrollToProducts = useCallback(() => {
    productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const applyUser = useCallback((user: UserType) => {
    setCurrentUser(user);
    setDeliveryInfo(prev => ({ ...prev, name: user.name || '', email: user.email || '', phone: user.phone || '' }));
  }, []);

  // ── Tema ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark'; // loja: claro por defeito
    setDarkMode(isDark);
    shopContext.setDarkMode(isDark);
    if (isDark) applyDarkModeVars(); else removeDarkModeVars();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTheme = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'dark' : 'light');
      if (next) applyDarkModeVars(); else removeDarkModeVars();
      shopContext.setDarkMode(next);
      return next;
    });
  }, [shopContext]);

  // ── Callbacks partilhados com o Header via ShopContext ────────────────────
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const handleProfileClick = useCallback(() => {
    if (currentUserRef.current) navigate('/minha-conta');
    else setShowLogin(true);
  }, [navigate]);

  const handleLoginClick = useCallback(() => setShowLogin(true), []);

  useEffect(() => {
    shopContext.setOnProfileClick(handleProfileClick);
    shopContext.setOnLoginClick(handleLoginClick);
    shopContext.setToggleTheme(toggleTheme);
    // O botão "filtros" do header leva à grelha de produtos (filtros por categoria estão lá)
    shopContext.setOnFilterClick(scrollToProducts);
  }, [shopContext, handleProfileClick, handleLoginClick, toggleTheme, scrollToProducts]);

  useEffect(() => { shopContext.setSearchTerm(searchTerm); }, [searchTerm, shopContext]);
  useEffect(() => { shopContext.setHasActiveFilters(selectedCategory !== 'all'); }, [selectedCategory, shopContext]);

  // ── Carregamento de dados ─────────────────────────────────────────────────
  // Erro só quando não há nada em cache para mostrar
  useEffect(() => {
    if (productsQuery.isError && !productsQuery.data) showToast('Erro ao carregar produtos. Tente novamente.', 'error');
  }, [productsQuery.isError, productsQuery.data, showToast]);

  // Utilizador: vindo do App (prop) ou sessão existente
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;

  useEffect(() => {
    if (propCurrentUser) {
      applyUser(propCurrentUser);
      return;
    }
    let cancelled = false;
    authService.getCurrentUser().then(user => {
      if (user && !cancelled) {
        applyUser(user);
        onLoginRef.current?.(user);
        setShowWelcome(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [propCurrentUser?.id, applyUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mensagem de boas-vindas: some após 4s ou ao fazer scroll
  useEffect(() => {
    if (!showWelcome) return;
    const timer = setTimeout(() => setShowWelcome(false), 4000);
    const onScroll = () => window.scrollY > 50 && setShowWelcome(false);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); };
  }, [showWelcome]);

  // Carrinho: actualizar preços/stock com o catálogo actual (promoções expiradas, etc.)
  useEffect(() => {
    if (products.length) cart.syncWithCatalog(products);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Categoria vinda do URL (?categoria=...)
  useEffect(() => {
    const cat = searchParams.get('categoria');
    if (cat) {
      setSelectedCategory(cat);
      scrollToProducts();
    }
  }, [searchParams, scrollToProducts]);

  // Âncoras (#produtos-section vindo de /loja, #faq do rodapé): esperar o conteúdo carregar
  useEffect(() => {
    if (loading || !location.hash) return;
    const t = setTimeout(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(t);
  }, [loading, location.hash]);

  // Debounce da pesquisa (300ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // ── Tracking ──────────────────────────────────────────────────────────────
  const {
    trackProductView,
    trackAddToCart,
    trackCheckoutStart,
    trackOrderComplete,
    trackSearch
  } = useShopTracking({ enabled: true, trackPageChanges: true });

  const trackProductViewRef = useRef(trackProductView);
  trackProductViewRef.current = trackProductView;
  useEffect(() => {
    // Exposto para componentes filhos (ProductCard)
    (window as any).__trackProductView = (...args: any[]) => (trackProductViewRef.current as any)(...args);
    return () => { delete (window as any).__trackProductView; };
  }, []);

  // ── Filtros / listagens ───────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (selectedCategory !== 'all') {
      const cat = selectedCategory.toLowerCase();
      filtered = filtered.filter(p => (p.category || '').toLowerCase() === cat);
    }

    if (debouncedSearchTerm) {
      const term = normalizeForSearch(debouncedSearchTerm);
      filtered = filtered.filter(p =>
        normalizeForSearch(p.name).includes(term) ||
        normalizeForSearch(p.category || '').includes(term)
      );
    }

    if (sortOrder === 'popular') filtered.sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0));
    else if (sortOrder === 'price_asc') filtered.sort((a, b) => getListingPrice(a) - getListingPrice(b));
    else if (sortOrder === 'price_desc') filtered.sort((a, b) => getListingPrice(b) - getListingPrice(a));
    else if (sortOrder === 'name_asc') filtered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortOrder === 'newest') filtered.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime());

    return filtered;
  }, [products, debouncedSearchTerm, selectedCategory, sortOrder]);

  const lastTrackedSearchRef = useRef('');
  useEffect(() => {
    if (debouncedSearchTerm && lastTrackedSearchRef.current !== debouncedSearchTerm) {
      lastTrackedSearchRef.current = debouncedSearchTerm;
      trackSearch(debouncedSearchTerm, filteredProducts.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach(p => {
      const key = (p.category || '').toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [products]);

  // Secções da homepage — a promoção só conta se estiver activa (datas incluídas)
  const promoProducts = useMemo(() => products.filter(p => getPromoPrice(p) != null).slice(0, 12), [products]);
  const bestSellers = useMemo(() =>
    products.filter(p => (p.totalSold || 0) > 0).sort((a, b) => (b.totalSold || 0) - (a.totalSold || 0)).slice(0, 12),
    [products]);
  const newestProducts = useMemo(() =>
    [...products].sort((a, b) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime()).slice(0, 12),
    [products]);

  const isBrowsingAll = selectedCategory === 'all' && !debouncedSearchTerm;

  // Novo filtro/pesquisa/ordenação → voltar ao primeiro lote
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [selectedCategory, debouncedSearchTerm, sortOrder]);
  // Ao rodar o ecrã/redimensionar: mantém o que já foi carregado, arredondado a linhas completas
  useEffect(() => { setVisibleCount(c => Math.max(PAGE_SIZE, Math.ceil(c / CHUNK) * CHUNK)); }, [CHUNK, PAGE_SIZE]);
  const visibleProducts = useMemo(() => filteredProducts.slice(0, visibleCount), [filteredProducts, visibleCount]);
  const remaining = filteredProducts.length - visibleProducts.length;

  const selectCategory = useCallback((name: string) => {
    setSelectedCategory(prev => (prev === name ? 'all' : name));
    scrollToProducts();
  }, [scrollToProducts]);

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const addToCart = useCallback((product: Product, variant?: ProductVariant, quantity: number = 1) => {
    const result = cart.addItem(product, variant, quantity);
    if (!result.ok) {
      showToast(result.message, 'warning');
      return;
    }
    showToast(result.message, 'success');
    const line = cart.items.find(i => i.productId === product.id);
    trackAddToCart(product.id, product.name, quantity, line?.price ?? getPromoPrice(product, variant) ?? getBasePrice(product, variant));
  }, [cart, showToast, trackAddToCart]);

  // ── Checkout ──────────────────────────────────────────────────────────────
  const openCheckout = useCallback(() => {
    if (cart.items.length === 0) {
      showToast('Adicione produtos ao carrinho', 'info');
      return;
    }
    trackCheckoutStart(cart.items as any, cart.subtotal);

    const user = currentUserRef.current;
    if (!user) {
      setLoginMessage(import.meta.env.VITE_GOOGLE_CLIENT_ID
        ? 'Inicie sessão para finalizar o pedido. Pode entrar com Google ou criar uma conta em segundos.'
        : 'Inicie sessão para finalizar o pedido, ou crie uma conta em segundos.');
      setShowLogin(true);
      setPendingCheckout(true);
      return;
    }
    if (needsProfileCompletion(user)) {
      setShowCompleteProfile(true);
      setPendingCheckout(true);
      return;
    }
    setDeliveryInfo(prev => ({ ...prev, name: user.name || prev.name, email: user.email || prev.email, phone: user.phone || prev.phone }));
    setShowCheckout(true);
    setPendingCheckout(false);
  }, [cart.items, cart.subtotal, showToast, trackCheckoutStart]);

  // O CartDrawer (no PublicLayout) chama este fluxo ao clicar "Finalizar pedido"
  const openCheckoutRef = useRef(openCheckout);
  openCheckoutRef.current = openCheckout;
  useEffect(() => {
    cart.setCheckoutHandler(() => openCheckoutRef.current());
    return () => cart.setCheckoutHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chegou de outra página com "Finalizar pedido" ou "abrir carrinho"
  useEffect(() => {
    const state = location.state as { startCheckout?: boolean; openCart?: boolean } | null;
    if (state?.startCheckout) openCheckoutRef.current();
    else if (state?.openCart) cart.open();
    if (state?.startCheckout || state?.openCart) navigate(location.pathname + location.hash, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Depois de login/perfil completo, retomar o que estava pendente */
  const continueAfterAuth = useCallback((user: UserType) => {
    if (needsProfileCompletion(user)) {
      setShowCompleteProfile(true);
    } else if (pendingCheckout) {
      setShowCheckout(true);
      setPendingCheckout(false);
    }
  }, [pendingCheckout]);

  const handleLogin = async (emailOrPhone: string, password: string) => {
    const { user, error } = await authService.signIn(emailOrPhone, password);
    if (!user) {
      showToast(error || 'Erro ao fazer login', 'error');
      return;
    }
    applyUser(user);
    setShowLogin(false);
    setLoginMessage(null);
    onLogin?.(user);
    continueAfterAuth(user);
  };

  const handleLogout = async () => {
    await authService.signOut();
    setCurrentUser(null);
    setDeliveryInfo(prev => ({ ...prev, name: '', email: '', phone: '' }));
    onLogout?.();
  };

  const handleCheckout = async () => {
    if (placingOrder) return; // evita pedidos duplicados por duplo clique
    const user = currentUser;
    if (!user) { openCheckout(); return; }
    if (needsProfileCompletion(user)) {
      setShowCompleteProfile(true);
      setPendingCheckout(true);
      return;
    }
    if (cart.items.length === 0) {
      showToast('Adicione produtos ao carrinho', 'info');
      return;
    }
    if (deliveryInfo.isDelivery && (!deliveryInfo.deliveryZoneId || !deliveryInfo.address.trim())) {
      showToast('Selecione a zona de entrega e indique o endereço', 'warning');
      return;
    }

    const orderItems: OrderItem[] = cart.items.map((item, idx) => ({
      id: `${item.productId}-${item.variantId || 'base'}-${idx}`,
      productId: item.productId,
      // variantId é necessário para o backend descontar o stock da variante certa
      variantId: item.variantId,
      variantName: item.variantName,
      productName: item.variantName ? `${item.productName} - ${item.variantName}` : item.productName,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      priceAtTime: item.price,
    }));

    const deliveryFee = deliveryInfo.isDelivery ? deliveryInfo.deliveryFee : 0;
    const discountAmount = appliedCoupon?.discountAmount || 0;
    const totalAmount = Math.max(0, cart.subtotal + deliveryFee - discountAmount);

    // Número do pedido é gerado pelo backend (dentro da transacção)
    const order = {
      id: '',
      customerId: user.customerId || '',
      customerName: user.name || '',
      customerPhone: user.phone || '',
      items: orderItems,
      totalAmount,
      status: OrderStatus.PENDING,
      createdAt: new Date().toISOString(),
      source: 'Direct' as any,
      isDelivery: deliveryInfo.isDelivery,
      deliveryLocation: deliveryInfo.address,
      deliveryFee,
      deliveryZoneId: deliveryInfo.deliveryZoneId || undefined,
      deliveryZoneName: deliveryInfo.deliveryZoneName || undefined,
      couponCode: appliedCoupon?.code || undefined,
      discountAmount: discountAmount || undefined,
    };

    setPlacingOrder(true);
    try {
      const result = await orderService.createOrder(order as any);
      if (!result.order) {
        showToast('Não foi possível criar o pedido. Verifique os dados e tente novamente.', 'error', 8000);
        return;
      }
      trackOrderComplete(result.order.id, totalAmount, orderItems);
      cart.clear();
      setAppliedCoupon(null);
      setShowCheckout(false);
      setOrderConfirmation({
        orderNumber: result.order.orderNumber || '',
        trackingCode: (result.order as any).trackingCode,
        // O servidor recalcula preços/entrega/cupão — mostrar o total que ficou registado
        total: Number(result.order.totalAmount ?? totalAmount),
        isDelivery: deliveryInfo.isDelivery,
      });
      // Stock mudou — actualizar o catálogo em segundo plano (sem esqueletos)
      queryClient.invalidateQueries({ queryKey: queryKeys.shop.products });
    } catch (error: any) {
      console.error('Erro ao criar pedido:', error);
      const msg = String(error?.message || '');
      // Mensagens de stock do backend são úteis ao cliente; o resto fica genérico
      showToast(
        /stock/i.test(msg) ? msg : 'Não foi possível enviar o pedido. Tente novamente ou fale connosco por WhatsApp.',
        'error',
        8000
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  const handleTrackOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const code = trackingInput.trim().toUpperCase();
    if (code) navigate(`/rastrear-encomenda?codigo=${encodeURIComponent(code)}`);
  };

  const whatsappNumber = (settings.company_phone || '').replace(/\D/g, '') || DEFAULT_WHATSAPP;
  const gridClass = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-4';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-base transition-colors duration-300">
      {/* Boas-vindas */}
      {currentUser && showWelcome && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-4 pb-2 animate-fadeIn">
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-4 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-full p-2">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm sm:text-base">Olá, {currentUser.name.split(' ')[0]}! 👋</p>
                <p className="text-white/90 text-xs sm:text-sm">
                  Bem-vindo de volta{settings?.company_name ? ` à ${settings.company_name}` : ''}
                </p>
              </div>
            </div>
            <button onClick={() => setShowWelcome(false)} className="w-10 h-10 flex items-center justify-center text-white/80 hover:text-white" aria-label="Fechar mensagem">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* ── HERO / BANNER (mobile: cartão arredondado com margem; desktop: largura total) ── */}
      <ShopBanner isAdmin={isAdmin} products={products} uploadImage={uploadProductImage} />

      {/* ── CATEGORIAS (mobile: círculos deslizáveis, como nas apps de lojas) ── */}
      {isMobile && categories.some(c => (categoryCounts.get(c.name.toLowerCase()) || 0) > 0) && (
        <section className="pt-5" aria-label="Categorias">
          <div className="chips-fade overflow-x-auto scrollbar-hide">
            <div className="flex gap-4 px-4 w-max">
              {categories.filter(c => (categoryCounts.get(c.name.toLowerCase()) || 0) > 0).map((cat, idx) => {
                const Icon = CATEGORY_ICONS[idx % CATEGORY_ICONS.length];
                const active = selectedCategory === cat.name;
                return (
                  <button
                    key={cat.id}
                    onClick={() => selectCategory(cat.name)}
                    aria-pressed={active}
                    className="w-[72px] flex flex-col items-center gap-1.5 !min-h-0"
                  >
                    {(() => {
                      const img = categoryImage(cat.name, cat.imageUrl);
                      return (
                        <span
                          className={`w-16 h-16 rounded-full overflow-hidden flex items-center justify-center border transition-shadow ${img ? 'bg-white border-border-default' : 'border-transparent'} ${active ? 'ring-2 ring-offset-2 ring-green-600 ring-offset-surface-base' : ''}`}
                          style={img ? undefined : { backgroundColor: cat.color || '#22c55e' }}
                        >
                          {img
                            ? <img src={img} alt="" className={`w-full h-full ${cat.imageUrl ? 'object-cover' : 'object-contain p-1.5'}`} loading="lazy" />
                            : <Icon className="w-7 h-7 text-white" />}
                        </span>
                      );
                    })()}
                    <span className={`text-[11px] leading-tight text-center line-clamp-2 ${active ? 'font-semibold text-green-700 dark:text-green-400' : 'text-content-secondary'}`}>
                      {cat.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── CATEGORIAS (desktop: cartões) ── */}
      {categories.length > 0 && !isMobile && (
        <section className="max-w-7xl mx-auto px-4 relative z-10 -mt-16">
          {/* Centradas: só aparecem categorias com produtos, por isso o nº varia */}
          <div className="flex flex-wrap justify-center gap-3 lg:gap-4">
            {categories.filter(c => loading || (categoryCounts.get(c.name.toLowerCase()) || 0) > 0).map((cat, idx) => {
              const Icon = CATEGORY_ICONS[idx % CATEGORY_ICONS.length];
              const count = categoryCounts.get(cat.name.toLowerCase()) || 0;
              return (
                <button
                  key={cat.id}
                  onClick={() => selectCategory(cat.name)}
                  aria-pressed={selectedCategory === cat.name}
                  className={`group bg-surface-raised rounded-2xl p-5 lg:p-6 shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-1 w-[calc(33.333%-0.5rem)] lg:w-44 ${selectedCategory === cat.name ? 'ring-2 ring-green-500' : ''}`}
                >
                  {(() => {
                    const img = categoryImage(cat.name, cat.imageUrl);
                    return (
                      <div
                        className={`w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mx-auto mb-3 border ${img ? 'bg-white border-border-default' : 'border-transparent'}`}
                        style={img ? undefined : { backgroundColor: cat.color || '#22c55e' }}
                      >
                        {img
                          ? <img src={img} alt="" className={`w-full h-full ${cat.imageUrl ? 'object-cover' : 'object-contain p-2'} group-hover:scale-105 transition-transform duration-300`} loading="lazy" />
                          : <Icon className="w-8 h-8 text-white" />}
                      </div>
                    );
                  })()}
                  <h3 className="text-base font-semibold mb-1 text-content-primary">{cat.name}</h3>
                  <p className="text-sm text-content-muted">
                    {loading ? ' ' : `${count} ${count === 1 ? 'produto' : 'produtos'}`}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── BANNER PROMOCIONAL ── */}
      <section className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${isMobile ? 'mt-5' : 'mt-12'}`}>
        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-3 sm:gap-4 rounded-2xl bg-gradient-to-r from-green-600 to-green-500 px-4 py-3 sm:px-6 sm:py-4 text-white shadow-sm"
        >
          <span className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center">
            <Gift className="w-5 h-5 sm:w-6 sm:h-6" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm sm:text-lg font-semibold leading-tight">Primeira compra?</span>
            <span className="block text-xs sm:text-sm text-green-50 leading-snug mt-0.5">Fale connosco e receba uma oferta exclusiva.</span>
          </span>
          <span className="hidden sm:inline-flex shrink-0 items-center h-11 px-5 rounded-xl bg-white text-green-700 font-semibold text-sm group-hover:bg-green-50 transition-colors">
            Falar connosco
          </span>
          <ChevronRight className="sm:hidden w-5 h-5 shrink-0 text-white/80" />
        </a>
      </section>

      {/* ── CARROSSÉIS ── */}
      {!loading && isBrowsingAll && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 space-y-8 sm:space-y-12">
          <ProductCarousel
            title="Em promoção"
            products={promoProducts}
            badge={promoProducts.length > 0 ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-semibold">
                {promoProducts.length} {promoProducts.length === 1 ? 'oferta' : 'ofertas'}
              </span>
            ) : undefined}
            onAddToCart={addToCart}
            onNotify={() => showToast('Será notificado quando estiver disponível!', 'info', 4000)}
            currentUserName={currentUser?.name}
          />
          <ProductCarousel
            title="Mais vendidos"
            products={bestSellers}
            onAddToCart={addToCart}
            onNotify={() => showToast('Será notificado quando estiver disponível!', 'info', 4000)}
            currentUserName={currentUser?.name}
          />
          <ProductCarousel
            title="Novidades"
            products={newestProducts}
            onAddToCart={addToCart}
            onNotify={() => showToast('Será notificado quando estiver disponível!', 'info', 4000)}
            currentUserName={currentUser?.name}
          />
        </section>
      )}

      {/* ── BANNER INTERMÉDIO ── */}
      <ShopMidBanner isAdmin={isAdmin} products={products} uploadImage={uploadProductImage} />

      {/* ── CATÁLOGO ── */}
      <section id="produtos-section" ref={productsSectionRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14 scroll-mt-20">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-content-primary">
              {selectedCategory !== 'all' ? selectedCategory : 'Todos os produtos'}
            </h2>
            {!loading && (
              <p className="text-sm text-content-muted mt-1">
                {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
                {debouncedSearchTerm && <> para “{debouncedSearchTerm}”</>}
              </p>
            )}
          </div>
        </div>

        {/* Pesquisa + ordenação */}
        <div className="flex items-center gap-2 sm:gap-3 mb-4">
          <div className="relative flex-1 min-w-0 sm:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
            <input
              type="search"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder={isMobile ? 'Pesquisar' : 'Pesquisar produtos...'}
              aria-label="Pesquisar produtos"
              className="w-full h-11 pl-10 pr-10 rounded-xl border border-border-default bg-surface-raised text-content-primary placeholder-content-muted text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-content-muted hover:text-content-primary" aria-label="Limpar pesquisa">
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
          {/* Ordenação: botão compacto com o select nativo invisível por cima (abre o seletor do sistema) */}
          <div className="relative shrink-0 h-11 flex items-center gap-1.5 pl-3 pr-2.5 rounded-xl border border-border-default bg-surface-raised text-content-secondary text-sm focus-within:ring-2 focus-within:ring-green-500/30 focus-within:border-green-500">
            <ArrowUpDown className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">{SORT_OPTIONS.find(o => o.value === sortOrder)?.label}</span>
            <span className="sm:hidden">Ordenar</span>
            <ChevronDown className="w-4 h-4 shrink-0 text-content-muted" />
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              aria-label="Ordenar produtos"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Categorias em chips — o único acesso a categorias no mobile */}
        {categories.length > 0 && (() => {
          // Nº de produtos por categoria; categorias vazias não aparecem
          const counts = new Map<string, number>();
          products.forEach(p => { if (p.category) counts.set(p.category, (counts.get(p.category) || 0) + 1); });
          const chips = [
            { id: 'all', name: 'all', label: 'Todos', count: products.length },
            ...categories.filter(c => (counts.get(c.name) || 0) > 0).map(c => ({ id: c.id, name: c.name, label: c.name, count: counts.get(c.name) || 0 })),
          ];
          return (
            <div className="chips-fade -mx-4 sm:mx-0 mb-5 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 px-4 sm:px-0 sm:flex-wrap w-max sm:w-auto" role="group" aria-label="Filtrar por categoria">
                {chips.map(c => {
                  const active = selectedCategory === c.name;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCategory(c.name === 'all' ? 'all' : (active ? 'all' : c.name))}
                      aria-pressed={active}
                      className={`shrink-0 inline-flex items-center gap-1.5 h-9 !min-h-0 pl-3.5 pr-2 rounded-full text-[13px] font-medium border transition-colors whitespace-nowrap ${active
                        ? 'bg-green-600 border-green-600 text-white shadow-sm'
                        : 'bg-surface-raised border-border-default text-content-secondary hover:border-green-500 hover:text-green-700 dark:hover:text-green-400'}`}
                    >
                      {c.label}
                      <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold tabular-nums flex items-center justify-center ${active ? 'bg-white/25 text-white' : 'bg-surface-base text-content-muted'}`}>
                        {c.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div className={gridClass}>
            {Array.from({ length: isMobile ? 6 : 10 }).map((_, i) => <ProductCardSkeleton key={i} isMobile={isMobile} />)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16 px-4">
            <div className="inline-flex w-20 h-20 items-center justify-center rounded-full bg-green-600/5 mb-4">
              <Search className="h-9 w-9 text-green-600/60" />
            </div>
            <p className="text-lg font-semibold text-content-primary">Nenhum produto encontrado</p>
            <p className="text-sm text-content-muted mt-1 mb-5">Experimente outra pesquisa ou veja todas as categorias.</p>
            {(selectedCategory !== 'all' || searchTerm) && (
              <button
                onClick={() => { setSelectedCategory('all'); setSearchTerm(''); }}
                className="px-5 py-2.5 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          (() => {
            // Grelha em blocos de linhas completas, com banners entre blocos
            const chunks: Product[][] = [];
            for (let i = 0; i < visibleProducts.length; i += CHUNK) chunks.push(visibleProducts.slice(i, i + CHUNK));
            return chunks.map((chunk, chunkIndex) => (
              <React.Fragment key={chunkIndex}>
                <div className={gridClass}>
                  {chunk.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAddToCart={addToCart}
                      onNotify={() => showToast('Será notificado quando este produto estiver disponível!', 'info', 4000)}
                      isMobile={isMobile}
                      currentUserName={currentUser?.name}
                    />
                  ))}
                </div>
                {chunkIndex < chunks.length - 1 && (
                  <InlineAdBanner slot={(chunkIndex % 2) + 1} isAdmin={isAdmin} products={products} />
                )}
              </React.Fragment>
            ));
          })()
        )}

        {/* Carregar mais — evita uma página interminável no mobile */}
        {!loading && filteredProducts.length > 0 && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-sm text-content-muted">
              A mostrar {visibleProducts.length} de {filteredProducts.length} produtos
            </p>
            <div className="w-48 h-1 rounded-full bg-border-default overflow-hidden" aria-hidden="true">
              <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${(visibleProducts.length / filteredProducts.length) * 100}%` }} />
            </div>
            {remaining > 0 && (
              <button
                onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                className="mt-1 w-full sm:w-auto px-8 h-12 rounded-xl border-2 border-green-600 text-green-700 dark:text-green-400 font-semibold hover:bg-green-600 hover:text-white transition-colors"
              >
                Ver mais {Math.min(remaining, PAGE_SIZE)} produtos
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── AVALIAÇÕES ── */}
      <TestimonialsSection />

      {/* ── PROGRAMA DE AFILIADOS ── */}
      <section className="px-4 sm:px-6 lg:px-8 py-4 sm:py-10">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-green-600 to-emerald-700 p-5 sm:p-8 text-white shadow-sm">
            <div className="absolute -right-8 -top-8 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
            <div className="absolute -right-4 bottom-0 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />
            <div className="relative flex flex-wrap sm:flex-nowrap items-center gap-x-4 gap-y-4 sm:gap-6">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <Gift className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-bold mb-1">Programa de Afiliados</h2>
                <p className="text-green-100 text-sm leading-relaxed max-w-lg">
                  Partilhe o seu link exclusivo e ganhe <strong className="text-white">5% de comissão</strong> em cada compra dos seus referidos. Sem limite de ganhos!
                </p>
                <div className="hidden sm:flex flex-wrap gap-4 mt-3 text-xs text-green-200">
                  <span className="flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Comissões ilimitadas</span>
                  <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Partilhe com amigos e família</span>
                  <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" /> Pagamento rápido</span>
                </div>
              </div>
              <button
                onClick={() => (currentUser ? navigate('/minha-conta/afiliado') : setShowLogin(true))}
                className="w-full sm:w-auto shrink-0 px-6 h-11 bg-white text-green-700 font-semibold rounded-xl hover:bg-green-50 transition-colors text-sm whitespace-nowrap"
              >
                {currentUser ? 'Ver o meu painel' : 'Aderir agora'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── BLOG ── */}
      {blogPosts.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14">
          <div className="flex items-end justify-between gap-4 mb-6 sm:mb-8">
            <div>
              <h2 className="text-lg sm:text-2xl font-bold text-content-primary">Os nossos artigos</h2>
              <p className="text-content-muted text-sm mt-1">Dicas de saúde e bem-estar natural</p>
            </div>
            <Link to="/blog" className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:underline">
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          {/* Mobile: carrossel deslizável; desktop: 3 colunas */}
          <div
            className="-mx-4 px-4 scroll-px-4 md:mx-0 md:px-0 md:scroll-px-0 flex md:grid md:grid-cols-3 gap-4 md:gap-5 overflow-x-auto md:overflow-visible snap-x snap-mandatory scrollbar-hide pb-2"
            onScroll={e => {
              const el = e.currentTarget;
              const first = el.firstElementChild as HTMLElement | null;
              if (first) setBlogSlide(Math.round(el.scrollLeft / (first.offsetWidth + 16)));
            }}
          >
            {blogPosts.map(post => (
              <Link key={post.id} to={`/blog/${post.slug}`}
                className="group snap-start shrink-0 w-full sm:w-[48%] md:w-auto bg-surface-raised rounded-2xl overflow-hidden border border-border-default shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col">
                {post.coverImage ? (
                  <img src={post.coverImage} alt={post.title} loading="lazy" className="w-full aspect-[16/10] object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full aspect-[16/10] bg-gradient-to-br from-green-100 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/20 flex items-center justify-center">
                    <Leaf className="w-10 h-10 text-green-400 opacity-40" />
                  </div>
                )}
                <div className="p-4 sm:p-5 flex flex-col flex-1">
                  {/* Linha das etiquetas sempre reservada → títulos alinhados entre cartões */}
                  <div className="flex gap-1 h-5 mb-2 overflow-hidden">
                    {(post.tags || []).slice(0, 2).map((t: string) => (
                      <span key={t} className="px-2 leading-5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-[11px] font-medium truncate">{t}</span>
                    ))}
                  </div>
                  <h3 className="font-bold text-content-primary text-base leading-snug line-clamp-2 mb-2 group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">{post.title}</h3>
                  {post.summary && <p className="text-content-muted text-sm leading-relaxed line-clamp-2">{post.summary}</p>}
                  <div className="flex-1" />
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-border-default text-xs text-content-muted">
                    <span>{new Date(post.publishedAt || post.createdAt).toLocaleDateString('pt-MZ', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    <span className="text-green-600 dark:text-green-400 font-medium group-hover:underline">Ler artigo →</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {/* Indicadores (mobile: 1 artigo por slide) */}
          {blogPosts.length > 1 && (
            <div className="md:hidden flex justify-center gap-1.5 mt-3" aria-hidden="true">
              {blogPosts.map((post, i) => (
                <span key={post.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === blogSlide ? 'w-5 bg-green-600' : 'w-1.5 bg-gray-300 dark:bg-gray-600'}`} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── RASTREAR ENCOMENDA (atalho para /rastrear-encomenda) ── */}
      <section className="py-4 sm:py-10 px-4 sm:px-6 lg:px-8">
        <form onSubmit={handleTrackOrder} className="max-w-2xl mx-auto bg-surface-raised rounded-3xl shadow-sm border border-border-default p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Truck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content-primary">Rastrear encomenda</h2>
              <p className="text-sm text-content-muted">Insira o código de rastreio que recebeu</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={trackingInput}
              onChange={e => setTrackingInput(e.target.value.toUpperCase())}
              placeholder={isMobile ? 'Código de rastreio' : 'Ex: NE-20260522-ABC123'}
              aria-label="Código de rastreio"
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-border-default bg-surface-base text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500/40"
            />
            <button
              type="submit"
              disabled={!trackingInput.trim()}
              className="shrink-0 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Rastrear
            </button>
          </div>
        </form>
      </section>

      <FAQSection />
      <ShopInstagram />

      {/* ── Modais ── */}
      {showLogin && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => { setShowLogin(false); setLoginMessage(null); setPendingCheckout(false); }}
          message={loginMessage}
          onUserLogin={async (user) => {
            applyUser(user);
            setShowLogin(false);
            setLoginMessage(null);
            onLogin?.(user);
            continueAfterAuth(user);
          }}
        />
      )}

      {showCompleteProfile && currentUser && (
        <CompleteProfileModal
          currentUser={currentUser}
          onClose={() => { setShowCompleteProfile(false); setPendingCheckout(false); }}
          onSuccess={(updated) => {
            setShowCompleteProfile(false);
            applyUser(updated);
            onLogin?.(updated);
            if (pendingCheckout) {
              setShowCheckout(true);
              setPendingCheckout(false);
            }
          }}
          showToast={showToast}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          deliveryInfo={deliveryInfo}
          onUpdateDeliveryInfo={setDeliveryInfo}
          onConfirm={handleCheckout}
          onClose={() => { setShowCheckout(false); setAppliedCoupon(null); }}
          subtotal={cart.subtotal}
          cart={cart.items}
          currentUser={currentUser}
          onEditProfile={() => { setShowCheckout(false); navigate('/minha-conta'); }}
          appliedCoupon={appliedCoupon}
          onApplyCoupon={setAppliedCoupon}
          submitting={placingOrder}
        />
      )}

      {orderConfirmation && (
        <OrderConfirmationModal
          confirmation={orderConfirmation}
          onClose={() => setOrderConfirmation(null)}
          onTrack={(code) => { setOrderConfirmation(null); navigate(`/rastrear-encomenda?codigo=${encodeURIComponent(code)}`); }}
          onViewOrders={() => { setOrderConfirmation(null); navigate('/minha-conta/encomendas'); }}
        />
      )}

      <ToastContainer toasts={toasts} onClose={removeToast} />

      <style>{`
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-scaleIn { animation: scaleIn 0.3s ease-out; }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal base: bottom sheet no mobile, centrado no desktop
// ─────────────────────────────────────────────────────────────────────────────
const SheetModal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; maxWidth?: string }> = ({ title, onClose, children, footer, maxWidth = 'sm:max-w-lg' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 modal-overlay-bg" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-surface-raised rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] animate-modal-enter`}>
        <div className="sm:hidden flex justify-center pt-3"><span className="w-10 h-1 rounded-full bg-border-strong/60" /></div>
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border-default shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-content-primary">{title}</h2>
          <button onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full text-content-muted hover:bg-surface-overlay transition-colors" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border-default px-5 sm:px-6 pt-4" style={{ paddingBottom: 'max(1rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

const inputClass = 'w-full px-4 py-3 border border-border-default rounded-xl bg-surface-base text-content-primary placeholder-content-muted focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500 transition';

// ─────────────────────────────────────────────────────────────────────────────
// Completar perfil (telefone obrigatório para a equipa confirmar o pedido)
// ─────────────────────────────────────────────────────────────────────────────
const CompleteProfileModal: React.FC<{
  currentUser: UserType;
  onClose: () => void;
  onSuccess: (updatedUser: UserType) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
}> = ({ currentUser, onClose, onSuccess, showToast }) => {
  const [name, setName] = useState(currentUser.name || '');
  const [phone, setPhone] = useState(currentUser.phone || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length < 8) {
      showToast('O telefone é obrigatório e deve ter pelo menos 8 dígitos', 'warning');
      return;
    }
    setLoading(true);
    try {
      const result = await authService.updateProfile(currentUser.id, { name: name.trim() || currentUser.name, phone: phone.trim() });
      if (result.success) {
        showToast('Perfil actualizado com sucesso!', 'success');
        const refreshed = await authService.getCurrentUser().catch(() => null);
        onSuccess(refreshed || { ...currentUser, name: name.trim() || currentUser.name, phone: phone.trim() });
      } else {
        showToast(result.error || 'Erro ao actualizar perfil', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Erro ao actualizar perfil', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetModal
      title="Completar perfil"
      onClose={onClose}
      maxWidth="sm:max-w-md"
      footer={
        <button
          type="submit"
          form="complete-profile-form"
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition disabled:opacity-50 flex items-center justify-center"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Guardar e continuar'}
        </button>
      }
    >
      <p className="mb-5 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 text-sm text-green-800 dark:text-green-300">
        Para finalizar o pedido precisamos do seu telefone/WhatsApp — a nossa equipa contacta-o para confirmar.
      </p>
      <form id="complete-profile-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="cp-name" className="block text-sm font-semibold text-content-primary mb-2">Nome</label>
          <input id="cp-name" type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} placeholder="O seu nome completo" autoComplete="name" />
        </div>
        <div>
          <label htmlFor="cp-phone" className="block text-sm font-semibold text-content-primary mb-2">
            Telefone/WhatsApp <span className="text-red-500">*</span>
          </label>
          <input
            id="cp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className={inputClass}
            placeholder="+258 84 123 4567"
            required
            pattern="[+]?[\d\s()\-]{8,}"
            minLength={8}
          />
        </div>
      </form>
    </SheetModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Checkout
// ─────────────────────────────────────────────────────────────────────────────
const CheckoutModal: React.FC<{
  deliveryInfo: DeliveryInfo;
  onUpdateDeliveryInfo: (info: DeliveryInfo) => void;
  onConfirm: () => void;
  onClose: () => void;
  subtotal: number;
  cart: CartItem[];
  currentUser?: UserType | null;
  onEditProfile?: () => void;
  appliedCoupon: AppliedCoupon | null;
  onApplyCoupon: (coupon: AppliedCoupon | null) => void;
  submitting: boolean;
}> = ({ deliveryInfo, onUpdateDeliveryInfo, onConfirm, onClose, subtotal, cart, currentUser, onEditProfile, appliedCoupon, onApplyCoupon, submitting }) => {
  const [couponInput, setCouponInput] = useState(appliedCoupon?.code || '');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponError, setCouponError] = useState('');

  const deliveryFee = deliveryInfo.isDelivery ? deliveryInfo.deliveryFee : 0;

  // O desconto foi calculado para a taxa de entrega daquele momento — se a entrega mudar, revalidar
  const lastFeeRef = useRef(deliveryFee);
  useEffect(() => {
    if (lastFeeRef.current !== deliveryFee) {
      lastFeeRef.current = deliveryFee;
      if (appliedCoupon) {
        onApplyCoupon(null);
        setCouponError('A entrega mudou — aplique o cupão novamente.');
      }
    }
  }, [deliveryFee, appliedCoupon, onApplyCoupon]);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponValidating(true);
    setCouponError('');
    try {
      const res = await api.post<{ valid: boolean; type: string; value: number; discountAmount: number; code: string; message: string }>(
        '/coupons/validate',
        { code: couponInput.trim(), totalAmount: subtotal, deliveryFee }
      );
      if (res.valid) {
        onApplyCoupon({ type: res.type, value: res.value, discountAmount: res.discountAmount, code: res.code });
      } else {
        setCouponError(res.message || 'Cupão inválido');
        onApplyCoupon(null);
      }
    } catch {
      setCouponError('Erro ao validar cupão');
    } finally {
      setCouponValidating(false);
    }
  };

  const discount = appliedCoupon?.discountAmount || 0;
  const total = Math.max(0, subtotal + deliveryFee - discount);

  return (
    <SheetModal
      title="Finalizar pedido"
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-content-secondary">Total a pagar</span>
            <span className="text-2xl font-bold text-content-primary tabular-nums">{formatMT(total)}</span>
          </div>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-semibold text-base transition disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -10px rgb(22 163 74)' }}
          >
            {submitting ? <><Loader2 className="h-5 w-5 animate-spin" /> A enviar pedido…</> : 'Confirmar pedido'}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Contacto */}
        {currentUser && (
          <section className="rounded-2xl p-4 border border-border-default">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-content-primary flex items-center gap-2">
                <User className="h-5 w-5 text-green-600 dark:text-green-400" /> Contacto
              </h3>
              {onEditProfile && (
                <button onClick={onEditProfile} className="text-sm text-green-600 dark:text-green-400 font-medium hover:underline">
                  Editar
                </button>
              )}
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-content-muted">Nome</dt><dd className="text-content-primary font-medium truncate">{currentUser.name || 'Não indicado'}</dd></div>
              <div><dt className="text-xs text-content-muted">Telefone/WhatsApp</dt><dd className="text-content-primary font-medium">{currentUser.phone || 'Não indicado'}</dd></div>
              <div><dt className="text-xs text-content-muted">Email</dt><dd className="text-content-primary font-medium truncate">{currentUser.email || 'Não indicado'}</dd></div>
            </dl>
          </section>
        )}

        {/* Entrega vs levantamento */}
        <section className="rounded-2xl p-4 border border-border-default">
          <h3 className="font-semibold text-content-primary flex items-center gap-2 mb-3">
            <MapPin className="h-5 w-5 text-green-600 dark:text-green-400" /> Como quer receber?
          </h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Método de recepção">
            {[
              { value: false, label: 'Levantar na loja', icon: Package },
              { value: true, label: 'Entrega ao domicílio', icon: Truck },
            ].map(opt => {
              const active = deliveryInfo.isDelivery === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onUpdateDeliveryInfo({ ...deliveryInfo, isDelivery: opt.value })}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-sm font-medium transition ${active
                    ? 'border-green-600 bg-green-600/5 text-green-700 dark:text-green-400'
                    : 'border-border-default text-content-secondary hover:border-green-500/50'}`}
                >
                  <Icon className="w-5 h-5" />
                  {opt.label}
                </button>
              );
            })}
          </div>

          {deliveryInfo.isDelivery && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-content-primary mb-2">
                  Zona de entrega <span className="text-red-500">*</span>
                </label>
                <DeliveryZoneSelector
                  selectedZoneId={deliveryInfo.deliveryZoneId}
                  selectedZoneName={deliveryInfo.deliveryZoneName}
                  onZoneSelect={(zone) => onUpdateDeliveryInfo({
                    ...deliveryInfo,
                    deliveryZoneId: zone?.id || '',
                    deliveryZoneName: zone?.name || '',
                    deliveryFee: zone?.price || 0,
                  })}
                  showPrice={false}
                />
                <p className="text-xs text-content-muted mt-1.5">
                  {deliveryInfo.deliveryZoneId ? `Taxa de entrega: ${formatMT(deliveryInfo.deliveryFee)}` : 'Selecione a zona para ver a taxa de entrega'}
                </p>
              </div>
              <div>
                <label htmlFor="checkout-address" className="block text-sm font-semibold text-content-primary mb-2">
                  Endereço de entrega <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="checkout-address"
                  value={deliveryInfo.address}
                  onChange={(e) => onUpdateDeliveryInfo({ ...deliveryInfo, address: e.target.value })}
                  className={`${inputClass} resize-none`}
                  rows={3}
                  autoComplete="street-address"
                  placeholder="Rua, número, bairro, cidade e um ponto de referência"
                  required
                />
              </div>
            </div>
          )}
        </section>

        {/* Cupão */}
        <section className="rounded-2xl p-4 border border-border-default">
          <h3 className="font-semibold text-content-primary flex items-center gap-2 mb-3">
            <Tag className="h-5 w-5 text-green-600 dark:text-green-400" /> Cupão de desconto
          </h3>
          {appliedCoupon ? (
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-400">{appliedCoupon.code}</p>
                <p className="text-xs text-green-600 dark:text-green-500">
                  {appliedCoupon.type === 'free_shipping' ? 'Entrega grátis' : `${appliedCoupon.value}% de desconto`} — -{formatMT(appliedCoupon.discountAmount)}
                </p>
              </div>
              <button
                onClick={() => { onApplyCoupon(null); setCouponInput(''); setCouponError(''); }}
                className="w-10 h-10 flex items-center justify-center rounded-full text-green-600 hover:text-red-500 dark:text-green-400 transition-colors"
                aria-label="Remover cupão"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                  className={`${inputClass} flex-1 min-w-0 font-mono uppercase text-sm`}
                  placeholder="CÓDIGO"
                  aria-label="Código do cupão"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  disabled={couponValidating || !couponInput.trim()}
                  className="shrink-0 px-5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center"
                >
                  {couponValidating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aplicar'}
                </button>
              </div>
              {couponError && <p className="text-xs text-red-500 mt-2">{couponError}</p>}
            </>
          )}
        </section>

        {/* Resumo */}
        <section className="rounded-2xl p-4 border border-border-default">
          <h3 className="font-semibold text-content-primary flex items-center gap-2 mb-3">
            <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" /> Resumo
          </h3>
          <ul className="divide-y divide-border-default">
            {cart.map(item => (
              <li key={`${item.productId}-${item.variantId || 'base'}`} className="flex justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-content-primary truncate">
                    {item.productName}{item.variantName && ` - ${item.variantName}`}
                  </p>
                  <p className="text-xs text-content-muted">{item.quantity} × {formatMT(item.price)}</p>
                </div>
                <span className="text-sm font-semibold text-content-primary tabular-nums shrink-0">{formatMT(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-3 pt-3 border-t border-border-default space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-content-secondary">Subtotal</dt><dd className="tabular-nums text-content-primary">{formatMT(subtotal)}</dd></div>
            {deliveryInfo.isDelivery && (
              <div className="flex justify-between">
                <dt className="text-content-secondary">Entrega{deliveryInfo.deliveryZoneName && ` (${deliveryInfo.deliveryZoneName})`}</dt>
                <dd className="tabular-nums text-content-primary">{deliveryInfo.deliveryZoneId ? formatMT(deliveryFee) : '—'}</dd>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <dt>Desconto ({appliedCoupon?.code})</dt><dd className="tabular-nums">-{formatMT(discount)}</dd>
              </div>
            )}
          </dl>
        </section>
      </div>
    </SheetModal>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Confirmação de pedido (momento "peak-end": o último ecrã que o cliente vê)
// ─────────────────────────────────────────────────────────────────────────────
const OrderConfirmationModal: React.FC<{
  confirmation: OrderConfirmation;
  onClose: () => void;
  onTrack: (code: string) => void;
  onViewOrders: () => void;
}> = ({ confirmation, onClose, onTrack, onViewOrders }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!confirmation.trackingCode) return;
    try {
      await navigator.clipboard.writeText(confirmation.trackingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard indisponível */ }
  };

  return (
    <SheetModal
      title="Pedido recebido"
      onClose={onClose}
      maxWidth="sm:max-w-md"
      footer={
        <div className="space-y-2">
          {confirmation.trackingCode && (
            <button
              onClick={() => onTrack(confirmation.trackingCode!)}
              className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition flex items-center justify-center gap-2"
            >
              <Truck className="w-5 h-5" /> Acompanhar encomenda
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onViewOrders} className="py-3 rounded-xl border border-border-default text-content-secondary font-medium hover:bg-surface-overlay transition">
              Minhas encomendas
            </button>
            <button onClick={onClose} className="py-3 rounded-xl border border-border-default text-content-secondary font-medium hover:bg-surface-overlay transition">
              Continuar a comprar
            </button>
          </div>
        </div>
      }
    >
      <div className="text-center">
        <div className="relative mx-auto mb-5 w-20 h-20">
          <span className="absolute inset-0 rounded-full bg-green-500/20 blur-xl" />
          <span className="relative flex w-20 h-20 items-center justify-center rounded-full bg-green-600 text-white animate-scaleIn">
            <CheckCircle className="w-10 h-10" />
          </span>
        </div>
        <h3 className="text-2xl font-bold text-content-primary mb-2">Obrigado pela sua compra!</h3>
        <p className="text-content-muted mb-6">
          Vamos contactá-lo por telefone/WhatsApp para confirmar o pedido
          {confirmation.isDelivery ? ' e combinar a entrega.' : ' e o levantamento.'}
        </p>

        <dl className="text-left rounded-2xl bg-surface-base border border-border-default divide-y divide-border-default">
          {confirmation.orderNumber && (
            <div className="flex justify-between px-4 py-3">
              <dt className="text-sm text-content-muted">Pedido nº</dt>
              <dd className="font-mono font-semibold text-content-primary">{confirmation.orderNumber}</dd>
            </div>
          )}
          {confirmation.trackingCode && (
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <dt className="text-sm text-content-muted">Código de rastreio</dt>
              <dd className="flex items-center gap-1">
                <span className="font-mono font-semibold text-content-primary text-sm">{confirmation.trackingCode}</span>
                <button onClick={copy} className="w-9 h-9 flex items-center justify-center rounded-lg text-content-muted hover:bg-surface-overlay" aria-label="Copiar código">
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </dd>
            </div>
          )}
          <div className="flex justify-between px-4 py-3">
            <dt className="text-sm text-content-muted">Total</dt>
            <dd className="font-bold text-content-primary tabular-nums">{formatMT(confirmation.total)}</dd>
          </div>
        </dl>
      </div>
    </SheetModal>
  );
};
