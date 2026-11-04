import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogIn, LogOut, Settings, ShoppingCart, Menu, X, Home, Info, Shield, Phone, BookOpen, Upload, ChevronRight, User as UserIcon, PackageSearch, LayoutDashboard } from 'lucide-react';
import { UserRole } from '../../../core/types/types';
import { Logo } from '../ui/Logo';
import { useMobile } from '../../../core/hooks/useMobile';
import { User as UserType } from '../../../core/types/types';

const getInitials = (name: string) =>
  (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

const UserAvatar: React.FC<{ user: UserType; size?: 'sm' | 'md' | 'lg' }> = ({ user, size = 'sm' }) => {
  const dim = size === 'sm' ? 'w-7 h-7 text-[11px]' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-lg';
  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' }}
    >
      {user.avatar
        ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
        : <span>{getInitials(user.name)}</span>
      }
    </div>
  );
};
import { uploadService } from '../../../../services/uploadService';
import api from '../../services/apiClient';
import { invalidateLogoCache } from '../../services/systemSettingsService';

/* ------------------------------------------------------------------ */
/* Menu lateral da loja (mobile) — Material 3 navigation drawer        */
/* Itens de 48px, ícones 20px, indicador em "pílula", secções com      */
/* título, safe-areas para a app Android (Capacitor).                  */
/* ------------------------------------------------------------------ */
const DRAWER_SECTIONS: { title: string; items: { to: string; label: string; icon: React.ElementType }[] }[] = [
  {
    title: 'Loja',
    items: [
      { to: '/', label: 'Início', icon: Home },
      { to: '/rastrear-encomenda', label: 'Rastrear encomenda', icon: PackageSearch },
      { to: '/blog', label: 'Blog', icon: BookOpen },
    ],
  },
  {
    title: 'Informações',
    items: [
      { to: '/sobre', label: 'Sobre nós', icon: Info },
      { to: '/politica', label: 'Política de troca', icon: Shield },
      { to: '/contactos', label: 'Fale connosco', icon: Phone },
    ],
  },
];

const drawerItemClass = (active: boolean) =>
  `flex items-center gap-3 w-full h-12 pl-4 pr-3 rounded-full text-[15px] text-left transition-colors ${
    active
      ? 'bg-green-600/[0.12] text-green-800 dark:text-green-300 font-semibold'
      : 'text-content-secondary font-medium active:bg-surface-base md:hover:bg-surface-base'
  }`;

const ShopDrawer: React.FC<{
  currentUser: UserType | null;
  isDarkMode: boolean;
  isStaff: boolean;
  cartItemCount: number;
  isActive: (to: string) => boolean;
  onClose: () => void;
  onCart?: () => void;
  onLogin: () => void;
  onProfile: () => void;
  onAdmin: () => void;
  onLogout: () => void;
}> = ({ currentUser, isDarkMode, isStaff, cartItemCount, isActive, onClose, onCart, onLogin, onProfile, onAdmin, onLogout }) => {
  // Esc fecha; bloqueia o scroll da página por trás
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        className="fixed left-0 top-0 bottom-0 w-[84vw] max-w-[320px] z-[101] bg-surface-raised shadow-2xl flex flex-col rounded-r-2xl animate-drawer-in"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        role="dialog" aria-modal="true" aria-label="Menu"
      >
        {/* Topo: logo + fechar */}
        <div className="flex items-center justify-between pl-5 pr-2 h-16 shrink-0">
          <Logo width={110} height={38} className="w-auto" isDarkMode={isDarkMode} />
          <button onClick={onClose} className="w-12 h-12 flex items-center justify-center rounded-full text-content-muted active:bg-surface-base" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {/* Conta */}
          {currentUser ? (
            <button onClick={onProfile} className="w-full flex items-center gap-3 p-3 rounded-2xl bg-surface-base border border-border-default text-left active:opacity-80">
              <UserAvatar user={currentUser} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-content-primary truncate">{currentUser.name}</span>
                <span className="block text-xs text-content-muted truncate">A minha conta e encomendas</span>
              </span>
              <ChevronRight className="h-5 w-5 text-content-muted shrink-0" />
            </button>
          ) : (
            <div className="p-4 rounded-2xl bg-green-600/[0.07] border border-green-600/10">
              <p className="text-sm font-semibold text-content-primary">Bem-vindo à Natur Erva</p>
              <p className="text-xs text-content-muted mt-1 mb-3 leading-relaxed">Entre para acompanhar as suas encomendas e comprar mais rápido.</p>
              <button onClick={onLogin} className="w-full h-11 rounded-full bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-green-700">
                <LogIn className="h-4 w-4" /> Entrar ou criar conta
              </button>
            </div>
          )}

          {/* Navegação */}
          <nav className="mt-2" aria-label="Menu principal">
            {DRAWER_SECTIONS.map((section, si) => (
              <div key={section.title} className={si > 0 ? 'mt-2 pt-2 border-t border-border-default' : ''}>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-content-muted">{section.title}</p>
                {section.items.map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} onClick={onClose} className={drawerItemClass(isActive(to))} aria-current={isActive(to) ? 'page' : undefined}>
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                  </Link>
                ))}
                {/* Carrinho no fim da secção Loja */}
                {si === 0 && onCart && (
                  <button onClick={onCart} className={drawerItemClass(false)}>
                    <ShoppingCart className="h-5 w-5 shrink-0" />
                    <span className="flex-1 truncate">Carrinho</span>
                    {cartItemCount > 0 && (
                      <span className="min-w-[24px] h-6 px-2 rounded-full bg-green-600 text-white text-xs font-semibold flex items-center justify-center tabular-nums">
                        {cartItemCount > 99 ? '99+' : cartItemCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
            ))}

            {isStaff && (
              <div className="mt-2 pt-2 border-t border-border-default">
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-content-muted">Gestão</p>
                <button onClick={onAdmin} className={drawerItemClass(false)}>
                  <LayoutDashboard className="h-5 w-5 shrink-0" />
                  <span className="flex-1 truncate">Painel de gestão</span>
                </button>
              </div>
            )}
          </nav>
        </div>

        {/* Rodapé fixo */}
        {currentUser && (
          <div className="shrink-0 px-3 py-2 border-t border-border-default">
            <button onClick={onLogout} className="flex items-center gap-3 w-full h-12 pl-4 pr-3 rounded-full text-[15px] font-medium text-red-600 dark:text-red-400 active:bg-red-50 dark:active:bg-red-900/10">
              <LogOut className="h-5 w-5 shrink-0" /> Terminar sessão
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

interface HeaderProps {
 currentUser: UserType | null;
 isDarkMode: boolean;
 toggleTheme: () => void;
 onLogout?: () => void;
 onLogin?: () => void;
 isShopMode?: boolean;
 cartItemCount?: number;
 onCartClick?: () => void;
 onProfileClick?: () => void;
}

const HeaderComponent: React.FC<HeaderProps> = ({
 currentUser,
 isDarkMode,
 toggleTheme,
 onLogout,
 onLogin,
 isShopMode = false,
 cartItemCount = 0,
 onCartClick,
 onProfileClick
}) => {
 const navigate = useNavigate();
 const location = useLocation();
 const isMobile = useMobile(768);
 const isTablet = useMobile(1024);
 const [sidebarOpen, setSidebarOpen] = useState(false);
 const [uploadingLogo, setUploadingLogo] = useState(false);
 const logoInputRef = useRef<HTMLInputElement>(null);

 const closeSidebar = useCallback(() => setSidebarOpen(false), []);

 const LOGO_ROLES = ['SUPER_ADMIN', 'ADMIN'];
 const canChangeLogo = currentUser && (
 (currentUser.roles?.some(r => LOGO_ROLES.includes(r.toUpperCase())) ?? false)
 || LOGO_ROLES.includes((currentUser.role ?? '').toUpperCase())
 );

 const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;
 setUploadingLogo(true);
 try {
 const result = await uploadService.uploadImage(file, 'logo', 1600);
 if (result?.url) {
 await api.put('/tax/config', { logoUrl: result.url });
 invalidateLogoCache();
 window.dispatchEvent(new Event('logo:updated'));
 }
 } catch { /* silent */ } finally {
 setUploadingLogo(false);
 e.target.value = '';
 }
 };

 const handleLogout = () => { onLogout?.(); };
 const isStaff = !!currentUser && currentUser.role !== UserRole.CLIENTE && !(currentUser.roles?.length === 1 && currentUser.roles[0] === 'CLIENTE');

 const navLinks = [
 { to: '/', label: 'Início', icon: <Home className="h-4 w-4" /> },
 { to: '/sobre', label: 'Sobre nós', icon: <Info className="h-4 w-4" /> },
 { to: '/blog', label: 'Blog', icon: <BookOpen className="h-4 w-4" /> },
 { to: '/rastrear-encomenda', label: 'Rastrear', icon: <PackageSearch className="h-4 w-4" /> },
 { to: '/politica', label: 'Nossa Política', icon: <Shield className="h-4 w-4" /> },
 { to: '/contactos', label: 'Fale Connosco', icon: <Phone className="h-4 w-4" /> },
 ];

 const isActive = (to: string) => to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

 if (isShopMode) {
 return (
 <header className="fixed top-0 left-0 right-0 z-50 bg-surface-raised/95 backdrop-blur-xl border-b border-border-default/80 shadow-sm" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
 <div className="max-w-7xl mx-auto px-3 sm:px-5 lg:px-8">
 <div className="flex items-center justify-between h-16 sm:h-[68px] gap-2 sm:gap-4">

 {/* Logo */}
 <div className="relative group flex-shrink-0">
 <Link to="/" className="flex items-center hover:opacity-80 transition-opacity" aria-label="Início">
 <Logo
 width={isMobile ? 100 : isTablet ? 120 : 140}
 height={isMobile ? 34 : isTablet ? 40 : 44}
 className="w-auto"
 isDarkMode={isDarkMode}
 />
 </Link>
 {canChangeLogo && (
 <>
 <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
 <button
 onClick={() => logoInputRef.current?.click()}
 disabled={uploadingLogo}
 title="Trocar logotipo"
 className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
 >
 {uploadingLogo
 ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
 : <Upload className="w-5 h-5 text-white drop-shadow" />}
 </button>
 </>
 )}
 </div>

 {/* Nav links — desktop */}
 {!isMobile && (
 <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
 {navLinks.map(link => (
 <Link
 key={link.to}
 to={link.to}
 className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
 isActive(link.to)
 ? 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
 : 'text-content-secondary hover:text-content-primary hover:bg-surface-base'
 }`}
 >
 {link.label}
 </Link>
 ))}
 </nav>
 )}

 {/* Actions */}
 <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">

 {/* Admin link */}
 {!isMobile && currentUser && currentUser.role !== UserRole.CLIENTE && !(currentUser.roles?.length === 1 && currentUser.roles[0] === 'CLIENTE') && (
 <button onClick={() => navigate('/admin')} className="w-10 h-10 flex items-center justify-center rounded-xl text-content-muted hover:bg-surface-base transition-colors" title="Painel Admin" aria-label="Painel Admin">
 <Settings className="h-4 w-4" />
 </button>
 )}

 {/* User — desktop only */}
 {!isMobile && (
 currentUser ? (
 <div className="flex items-center gap-1.5">
 <button
 onClick={onProfileClick}
 title="Área de Membro"
 className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-border-default hover:bg-surface-base transition-all group"
 >
 <UserAvatar user={currentUser} size="sm" />
 <span className="text-xs font-medium text-content-secondary group-hover:text-content-primary max-w-[80px] truncate leading-none">
 {currentUser.name.split(' ')[0]}
 </span>
 </button>
 <button onClick={handleLogout} className="p-1.5 rounded-lg text-content-muted hover:bg-surface-base hover:text-red-500 transition-all" title="Sair">
 <LogOut className="h-3.5 w-3.5" />
 </button>
 </div>
 ) : (
 <button onClick={() => onLogin?.()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
 <LogIn className="h-4 w-4" />
 Entrar
 </button>
 )
 )}

 {/* Conta — mobile (no desktop está o botão com nome/Entrar) */}
 {isMobile && (
 <button
 onClick={() => (currentUser ? onProfileClick?.() : onLogin?.())}
 className="w-11 h-11 flex items-center justify-center rounded-xl text-content-secondary hover:bg-surface-base transition-colors"
 aria-label={currentUser ? 'A minha conta' : 'Entrar'}
 >
 {currentUser ? <UserAvatar user={currentUser} size="sm" /> : <UserIcon className="h-[22px] w-[22px]" />}
 </button>
 )}

 {/* Cart */}
 {onCartClick && (
 <button
 onClick={onCartClick}
 className="relative w-11 h-11 flex items-center justify-center rounded-xl text-content-secondary hover:bg-surface-base transition-colors"
 aria-label={cartItemCount > 0 ? `Carrinho, ${cartItemCount} ${cartItemCount === 1 ? 'artigo' : 'artigos'}` : 'Carrinho'}
 >
 <ShoppingCart className="h-[22px] w-[22px]" />
 {cartItemCount > 0 && (
 <span className="absolute top-0.5 right-0.5 bg-green-600 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 ring-2 ring-surface-raised">
 {cartItemCount > 9 ? '9+' : cartItemCount}
 </span>
 )}
 </button>
 )}

 {/* Hamburger — mobile/tablet */}
 <button onClick={() => setSidebarOpen(true)} className="md:hidden w-11 h-11 -mr-1 flex items-center justify-center rounded-xl text-content-secondary hover:bg-surface-base transition-colors" aria-label="Abrir menu">
 <Menu className="h-[22px] w-[22px]" />
 </button>
 </div>
 </div>
 </div>

 {/* Menu lateral mobile — padrão "navigation drawer" Material 3 (Android) */}
 {sidebarOpen && typeof document !== 'undefined' && createPortal(
 <ShopDrawer
 currentUser={currentUser}
 isDarkMode={isDarkMode}
 isStaff={isStaff}
 cartItemCount={cartItemCount}
 isActive={isActive}
 onClose={closeSidebar}
 onCart={onCartClick ? () => { closeSidebar(); onCartClick(); } : undefined}
 onLogin={() => { closeSidebar(); onLogin?.(); }}
 onProfile={() => { closeSidebar(); onProfileClick?.(); }}
 onAdmin={() => { closeSidebar(); navigate('/admin'); }}
 onLogout={() => { closeSidebar(); handleLogout(); }}
 />,
 document.body
 )}
 </header>
 );
 }

 // Admin header
 return (
 <header className="backdrop-blur-xl bg-surface-raised/90 border-b border-border-default shadow-sm sticky top-0 z-50">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
 <div className="flex items-center justify-between">
 <Link to="/admin" className="flex items-center hover:opacity-80 transition-opacity">
 <Logo width={140} height={46} className="w-auto" isDarkMode={isDarkMode} />
 </Link>
 <div className="flex items-center gap-2">
 {currentUser && (
 <button onClick={() => navigate('/')} className="px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm font-medium shadow-lg shadow-green-500/25 transition-all hover:shadow-xl hover:shadow-green-500/30">
 Voltar ao Site
 </button>
 )}
 </div>
 </div>
 </div>
 </header>
 );
};

export const Header = memo(HeaderComponent, (prevProps, nextProps) =>
 prevProps.currentUser?.id === nextProps.currentUser?.id &&
 prevProps.isDarkMode === nextProps.isDarkMode &&
 prevProps.cartItemCount === nextProps.cartItemCount &&
 prevProps.isShopMode === nextProps.isShopMode &&
 prevProps.onCartClick === nextProps.onCartClick &&
 prevProps.onLogin === nextProps.onLogin &&
 prevProps.onProfileClick === nextProps.onProfileClick
);
