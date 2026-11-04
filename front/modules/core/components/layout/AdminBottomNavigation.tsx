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

  // Material 3 navigation bar: todos os itens com a mesma estrutura (pílula 56×32 + rótulo),
  // rótulos na mesma linha. "Vender" fica sempre com a pílula verde preenchida.
  const pillClass = primary
   ? 'bg-brand-600 text-white shadow-sm'
   : isActive
    ? 'bg-brand-600/10 dark:bg-brand-400/15 text-brand-700 dark:text-brand-300'
    : 'text-content-muted';
  const labelClass = isActive || primary
   ? 'font-semibold text-brand-700 dark:text-brand-300'
   : 'font-medium text-content-muted';
  return (
   <button
    key={id}
    onClick={onClick}
    aria-label={label}
    aria-current={isActive ? 'page' : undefined}
    className="flex-1 min-w-0 flex flex-col items-center justify-start gap-1 h-14 !min-h-0 pt-1 touch-manipulation group"
   >
    <span className={`flex items-center justify-center w-14 h-8 rounded-full transition-colors duration-200 group-active:scale-95 ${pillClass}`}>
     <Icon className="w-[22px] h-[22px]" strokeWidth={isActive || primary ? 2.25 : 1.75} />
    </span>
    <span className={`text-xs leading-4 truncate max-w-full transition-colors ${labelClass}`}>{label}</span>
   </button>
  );
 };

 return (
  <nav
   className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-raised border-t border-border-default"
   aria-label="Navegação principal"
  >
   <div
    className="flex items-stretch justify-around px-1 pt-2"
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
