import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import { Header } from '../../modules/core/components/layout/Header';
import { Footer } from '../../modules/core/components/layout/Footer';
import { User } from '../../modules/core/types/types';
import { useShopContextSafe } from '../../contexts/ShopContext';
import { CartDrawer } from '../../modules/shop/components/CartDrawer';
import { useCart } from '../../modules/shop/context/CartContext';
import { ShopTabBar } from '../../modules/shop/components/ShopTabBar';
import { RouteTransition } from '../../modules/core/mobile/RouteTransition';

interface PublicLayoutProps {
  currentUser: User | null;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout?: () => void;
  onLogin?: () => void;
}

// Componente interno que usa o contexto - memoizado
const PublicLayoutContent: React.FC<PublicLayoutProps> = ({
  currentUser,
  isDarkMode,
  toggleTheme,
  onLogout,
  onLogin
}) => {
  // Usar contexto do Shop (pode ser null se não estiver disponível)
  const shopContext = useShopContextSafe();
  // Carrinho único (CartContext) — o mesmo em todas as páginas públicas
  const cart = useCart();

  // Memoizar valores derivados do contexto para evitar recálculos
  // IMPORTANTE: Não memoizar os callbacks para garantir que mudanças sejam detectadas
  const effectiveDarkMode = useMemo(() => shopContext?.darkMode ?? isDarkMode, [shopContext?.darkMode, isDarkMode]);
  const effectiveToggleTheme = useMemo(() => shopContext?.toggleTheme ?? toggleTheme, [shopContext?.toggleTheme, toggleTheme]);

  // NÃO memoizar callbacks - garantir que mudanças sejam detectadas pelo Header
  const effectiveOnProfileClick = shopContext?.onProfileClick;
  const effectiveOnLoginClick = shopContext?.onLoginClick;
  
  // Forçar re-render quando callbacks mudarem usando um estado local
  const [callbacksReady, setCallbacksReady] = useState(false);
  
  useEffect(() => {
    // Quando os callbacks estiverem disponíveis, forçar re-render
    if (shopContext?.onLoginClick) {
      setCallbacksReady(true);
    }
  }, [shopContext?.onLoginClick]);
  
  // Criar fallback para onLogin se não estiver disponível no contexto ainda
  // Isso garante que o botão sempre tenha uma função válida, mesmo na primeira renderização
  const handleLoginFallback = useCallback(() => {
    // Tentar usar o callback do contexto primeiro (via ref para garantir disponibilidade)
    if (shopContext?.onLoginClick) {
      shopContext.onLoginClick();
    } else if (onLogin) {
      onLogin();
    } else {
      // Se não houver nenhum callback, pelo menos não quebrar
      console.warn('onLoginClick não está disponível no contexto e nenhum fallback foi fornecido');
    }
  }, [shopContext?.onLoginClick, onLogin]);
  
  return (
    <div className="min-h-screen flex flex-col bg-surface-base transition-colors duration-300">
      <Header
        currentUser={currentUser}
        isDarkMode={effectiveDarkMode}
        toggleTheme={effectiveToggleTheme}
        onLogout={onLogout}
        onLogin={effectiveOnLoginClick || handleLoginFallback}
        isShopMode={true}
        cartItemCount={cart.count}
        onCartClick={cart.open}
        onProfileClick={effectiveOnProfileClick}
      />
      <main className="flex-1 shop-main-offset shop-main-tabbar">
        {/* Só o conteúdo mostra o carregamento; o cabeçalho e o rodapé ficam no lugar */}
        <Suspense fallback={<div className="min-h-[60vh] flex items-center justify-center" role="status" aria-label="A carregar"><Loader2 className="w-7 h-7 animate-spin text-green-600" /></div>}>
          <RouteTransition>
            <Outlet />
          </RouteTransition>
        </Suspense>
      </main>
      <Footer isShopMode={true} />
      <ShopTabBar
        currentUser={currentUser}
        cartCount={cart.count}
        onCartClick={cart.open}
        onShowProducts={shopContext?.onFilterClick}
        onLogin={handleLoginFallback}
      />
      <CartDrawer />
    </div>
  );
};

// NÃO memoizar o PublicLayout para garantir que re-renderize quando o contexto mudar
// Isso é necessário para que o Header receba os callbacks quando o Shop os definir
export const PublicLayout: React.FC<PublicLayoutProps> = (props) => {
  return <PublicLayoutContent {...props} />;
};
