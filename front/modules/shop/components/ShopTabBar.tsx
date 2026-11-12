import React, { memo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingCart, User as UserIcon } from 'lucide-react';
import type { User } from '../../core/types/types';
import { isClientUser } from '../../core/hooks/useUserPermissions';
import { haptic } from '../../core/mobile/native';

interface ShopTabBarProps {
  currentUser: User | null;
  cartCount: number;
  onCartClick: () => void;
  onShowProducts?: () => void;
  onLogin: () => void;
}

type TabId = 'home' | 'products' | 'cart' | 'account';

/**
 * Barra de separadores da loja (só mobile, < md). Escondida na página de produto, onde a
 * barra fixa de compra ocupa o mesmo lugar, e com o teclado aberto (CSS: html.keyboard-open).
 */
export const ShopTabBar: React.FC<ShopTabBarProps> = memo(({ currentUser, cartCount, onCartClick, onShowProducts, onLogin }) => {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();

  if (pathname.startsWith('/loja/produto/')) return null;

  const active: TabId | null =
    pathname === '/' ? (hash === '#produtos-section' ? 'products' : 'home')
    : pathname.startsWith('/minha-conta') ? 'account'
    : null;

  const go = (id: TabId) => {
    haptic();
    switch (id) {
      case 'home':
        if (pathname === '/' && !hash) window.scrollTo({ top: 0, behavior: 'smooth' }); // toque no separador activo → topo
        else navigate('/');
        break;
      case 'products':
        if (pathname === '/' && onShowProducts) onShowProducts();
        else navigate('/#produtos-section');
        break;
      case 'cart':
        onCartClick();
        break;
      case 'account':
        if (!currentUser) onLogin();
        else navigate(isClientUser(currentUser) ? '/minha-conta' : '/admin');
        break;
    }
  };

  const tabs: { id: TabId; label: string; icon: typeof Home; badge?: number }[] = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'products', label: 'Produtos', icon: LayoutGrid },
    { id: 'cart', label: 'Carrinho', icon: ShoppingCart, badge: cartCount },
    { id: 'account', label: currentUser ? 'Conta' : 'Entrar', icon: UserIcon },
  ];

  return (
    <nav
      aria-label="Navegação principal"
      className="shop-tabbar md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-raised/95 backdrop-blur-xl border-t border-border-default"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-1">
        {tabs.map(({ id, label, icon: Icon, badge }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={badge ? `${label} (${badge})` : label}
              className="flex-1 min-w-0 flex flex-col items-center justify-start gap-0.5 h-14 !min-h-0 touch-manipulation group"
            >
              <span
                className={`relative flex items-center justify-center w-14 h-8 rounded-full transition-colors duration-200 group-active:scale-95 ${
                  isActive ? 'bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300' : 'text-content-muted'
                }`}
              >
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                {badge ? (
                  <span className="absolute top-0 right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold leading-[18px] text-center tabular-nums">
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              <span className={`text-[11px] leading-tight truncate ${isActive ? 'font-semibold text-content-primary' : 'text-content-muted'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});
ShopTabBar.displayName = 'ShopTabBar';
