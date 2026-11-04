import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, CreditCard, Package, Menu } from 'lucide-react';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { User } from '../../../core/types/types';

interface AdminBottomNavigationProps {
 onOpenMenu: () => void;
 isMenuOpen?: boolean;
 currentUser: User;
}

interface NavItem {
 id: string;
 label: string;
 icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
 path: string;
 permission: string;
 /** Destaque visual para a acção principal (zona do polegar) */
 primary?: boolean;
}

// Máx. 4 destinos + Menu — os mais usados no dia-a-dia da loja
const NAV_ITEMS: NavItem[] = [
 { id: 'dashboard', label: 'Início', icon: LayoutDashboard, path: '/admin', permission: 'dashboard.view' },
 { id: 'orders', label: 'Pedidos', icon: ShoppingCart, path: '/admin/vendas/pedidos', permission: 'orders.view' },
 { id: 'pos-sell', label: 'Vender', icon: CreditCard, path: '/admin/pos', permission: 'sales.view', primary: true },
 { id: 'products', label: 'Produtos', icon: Package, path: '/admin/produtos', permission: 'products.view' },
];

/** Devolve o id do item cujo path coincide de forma mais específica com a rota actual */
const resolveActive = (pathname: string, items: NavItem[]): string | null => {
 const path = pathname.replace(/\/$/, '') || '/';
 let best: NavItem | null = null;
 for (const item of items) {
  const matches = item.path === '/admin'
   ? path === '/admin'
   : path === item.path || path.startsWith(item.path + '/');
  if (matches && (!best || item.path.length > best.path.length)) best = item;
 }
 return best?.id ?? null;
};

export const AdminBottomNavigation: React.FC<AdminBottomNavigationProps> = ({
 onOpenMenu,
 isMenuOpen = false,
 currentUser
}) => {
 const { hasPermission } = usePermissions(currentUser);
 const location = useLocation();
 const navigate = useNavigate();

 const items = useMemo(
  () => NAV_ITEMS.filter(item => hasPermission(item.permission)),
  [hasPermission]
 );

 const activeId = isMenuOpen ? 'menu' : resolveActive(location.pathname, items);

 const renderItem = (
  id: string,
  label: string,
  Icon: NavItem['icon'],
  onClick: () => void,
  primary = false
 ) => {
  const isActive = activeId === id;

  if (primary) {
   return (
    <button
     key={id}
     onClick={onClick}
     aria-label={label}
     aria-current={isActive ? 'page' : undefined}
     className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] touch-manipulation group"
    >
     <span
      className={`flex items-center justify-center w-12 h-12 -mt-6 rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 ring-4 ring-surface-raised transition-transform duration-200 group-active:scale-95 ${isActive ? 'scale-105' : ''}`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 20px -6px var(--brand-600)' }}
     >
      <Icon className="w-6 h-6" strokeWidth={2.25} />
     </span>
     <span className={`text-[11px] leading-none font-semibold ${isActive ? 'text-brand-600 dark:text-brand-400' : 'text-content-secondary'}`}>
      {label}
     </span>
    </button>
   );
  }

  return (
   <button
    key={id}
    onClick={onClick}
    aria-label={label}
    aria-current={isActive ? 'page' : undefined}
    className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] touch-manipulation group"
   >
    <span
     className={`flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 group-active:scale-95 ${isActive
      ? 'bg-brand-600/10 dark:bg-brand-400/15 text-brand-600 dark:text-brand-400'
      : 'text-content-muted'
      }`}
    >
     <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.25 : 1.75} />
    </span>
    <span className={`text-[11px] leading-none transition-colors ${isActive
     ? 'font-semibold text-brand-600 dark:text-brand-400'
     : 'font-medium text-content-muted'
     }`}>
     {label}
    </span>
   </button>
  );
 };

 return (
  <nav
   className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-raised/95 backdrop-blur-xl border-t border-border-default"
   style={{ boxShadow: '0 -4px 24px -8px rgba(48,49,61,0.12)' }}
   aria-label="Navegação principal"
  >
   <div
    className="flex items-stretch justify-around px-2 pt-2"
    style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
   >
    {items.map(item =>
     renderItem(item.id, item.label, item.icon, () => navigate(item.path), item.primary)
    )}
    {renderItem('menu', 'Menu', Menu, onOpenMenu)}
   </div>
  </nav>
 );
};
