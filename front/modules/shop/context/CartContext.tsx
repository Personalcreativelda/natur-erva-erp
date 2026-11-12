import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Product, ProductVariant } from '../../core/types/types';
import { getAvailableStock, getDefaultVariant, getEffectivePrice } from '../utils/pricing';
import { haptic } from '../../core/mobile/native';

/**
 * Carrinho único da loja (antes existiam 3 implementações a sincronizar via localStorage:
 * Shop.tsx, CartDrawer.tsx e ProductLandingPage.tsx).
 */

export interface CartItem {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  price: number;
  unit: string;
  image?: string;
  /** Stock disponível no momento em que foi adicionado — limita o botão "+" */
  maxStock?: number;
}

export type CartResult = { ok: true; message: string } | { ok: false; message: string };

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  addItem: (product: Product, variant?: ProductVariant | null, quantity?: number) => CartResult;
  updateQuantity: (productId: string, variantId: string | undefined, delta: number) => CartResult;
  removeItem: (productId: string, variantId: string | undefined) => void;
  clear: () => void;
  /** Actualiza preço/stock dos itens com o catálogo actual (promoções expiradas, preço alterado, etc.) */
  syncWithCatalog: (products: Product[]) => void;
  /** A página da loja regista aqui o seu fluxo de checkout (login → perfil → checkout) */
  setCheckoutHandler: (handler: (() => void) | null) => void;
  requestCheckout: () => boolean;
}

const STORAGE_KEY = 'shop_cart';

const readStorage = (): CartItem[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(i => i && i.productId && i.quantity > 0) : [];
  } catch {
    return [];
  }
};

const writeStorage = (items: CartItem[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* modo privado / storage cheio — o carrinho continua a funcionar em memória */
  }
};

const sameLine = (a: Pick<CartItem, 'productId' | 'variantId'>, productId: string, variantId?: string) =>
  a.productId === productId && (a.variantId || undefined) === (variantId || undefined);

const CartContext = createContext<CartContextValue | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(readStorage);
  const [isOpen, setIsOpen] = useState(false);
  const checkoutHandlerRef = useRef<(() => void) | null>(null);
  // Espelho síncrono do estado para validar stock sem depender de closures antigas
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const commit = useCallback((next: CartItem[]) => {
    itemsRef.current = next;
    setItems(next);
    writeStorage(next);
  }, []);

  // Sincronizar entre separadores do browser
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setItems(readStorage());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback<CartContextValue['addItem']>((product, variant, quantity = 1) => {
    const v = variant || getDefaultVariant(product);
    const stock = getAvailableStock(product, v);
    const displayName = v?.name ? `${product.name} - ${v.name}` : product.name;

    if (stock <= 0) return { ok: false, message: 'Produto sem stock disponível' };

    const current = itemsRef.current;
    const existing = current.find(i => sameLine(i, product.id, v?.id));
    const newQty = (existing?.quantity || 0) + quantity;
    if (newQty > stock) {
      return { ok: false, message: `Stock insuficiente. Apenas ${stock} ${stock === 1 ? 'unidade disponível' : 'unidades disponíveis'}.` };
    }

    const line: CartItem = {
      productId: product.id,
      productName: product.name,
      variantId: v?.id,
      variantName: v?.name,
      quantity: newQty,
      price: getEffectivePrice(product, v),
      unit: v?.unit || product.unit || '',
      image: product.image,
      maxStock: stock,
    };

    commit(existing
      ? current.map(i => (sameLine(i, product.id, v?.id) ? line : i))
      : [...current, line]);

    haptic('MEDIUM');
    return { ok: true, message: `${displayName} adicionado ao carrinho` };
  }, [commit]);

  const updateQuantity = useCallback<CartContextValue['updateQuantity']>((productId, variantId, delta) => {
    const current = itemsRef.current;
    const item = current.find(i => sameLine(i, productId, variantId));
    if (!item) return { ok: false, message: 'Item não encontrado' };

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      commit(current.filter(i => !sameLine(i, productId, variantId)));
      return { ok: true, message: 'Item removido' };
    }
    if (delta > 0 && item.maxStock != null && newQty > item.maxStock) {
      return { ok: false, message: `Stock insuficiente. Apenas ${item.maxStock} disponíveis.` };
    }
    commit(current.map(i => (sameLine(i, productId, variantId) ? { ...i, quantity: newQty } : i)));
    return { ok: true, message: '' };
  }, [commit]);

  const removeItem = useCallback<CartContextValue['removeItem']>((productId, variantId) => {
    commit(itemsRef.current.filter(i => !sameLine(i, productId, variantId)));
  }, [commit]);

  const clear = useCallback(() => commit([]), [commit]);

  const syncWithCatalog = useCallback((products: Product[]) => {
    const current = itemsRef.current;
    if (!current.length || !products.length) return;
    const byId = new Map(products.map(p => [p.id, p]));
    let changed = false;
    const next = current.flatMap(item => {
      const product = byId.get(item.productId);
      if (!product) return [item]; // produto não carregado — mantém (o backend valida no checkout)
      if (product.showInShop === false) { changed = true; return []; }
      const variant = item.variantId ? product.variants?.find(v => v.id === item.variantId) : undefined;
      if (item.variantId && !variant) { changed = true; return []; }
      const price = getEffectivePrice(product, variant);
      const maxStock = getAvailableStock(product, variant);
      const quantity = Math.min(item.quantity, Math.max(maxStock, 0));
      if (quantity <= 0) { changed = true; return []; }
      if (price !== item.price || maxStock !== item.maxStock || quantity !== item.quantity) {
        changed = true;
        return [{ ...item, price, maxStock, quantity }];
      }
      return [item];
    });
    if (changed) commit(next);
  }, [commit]);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const setCheckoutHandler = useCallback((handler: (() => void) | null) => {
    checkoutHandlerRef.current = handler;
  }, []);

  const requestCheckout = useCallback(() => {
    if (!checkoutHandlerRef.current) return false;
    setIsOpen(false);
    checkoutHandlerRef.current();
    return true;
  }, []);

  const value = useMemo<CartContextValue>(() => ({
    items,
    count: items.reduce((s, i) => s + i.quantity, 0),
    subtotal: items.reduce((s, i) => s + i.price * i.quantity, 0),
    isOpen,
    open,
    close,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    syncWithCatalog,
    setCheckoutHandler,
    requestCheckout,
  }), [items, isOpen, open, close, addItem, updateQuantity, removeItem, clear, syncWithCatalog, setCheckoutHandler, requestCheckout]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextValue => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>');
  return ctx;
};
