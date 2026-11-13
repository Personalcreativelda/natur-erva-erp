import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AdminBottomNavigation } from './AdminBottomNavigation';
import { MobileAdminMenu } from './MobileAdminMenu';
import { RouteTransition } from '../../mobile/RouteTransition';

import { User, UserRole } from '../../../core/types/types';
import { X, LogOut, ChevronDown, User as UserIcon, Globe, LayoutDashboard, ShoppingCart, TrendingUp, Truck, Users, Package, ShoppingBag, BarChart3, Activity, FileText, ArrowLeftRight, Wallet, Repeat, Share2, Megaphone, Image, Tag, Ruler, List, ClipboardCheck, AlertTriangle, Scale, Shield, Boxes, Store, MapPin, CreditCard, BookOpen, Building2, UserCog, FolderKanban, Headphones, Clock, MessageSquare, RefreshCw, FolderOpen, HeartPulse, Search, Bot } from 'lucide-react';
import { useLanguage } from '../../../core/contexts/LanguageContext';
import { Logo } from '../ui/Logo';
import { Avatar } from '../ui/Avatar';
import { usePermissions } from '../../../core/hooks/usePermissions';
import { useMobile } from '../../../core/hooks/useMobile';
import { Footer } from '../layout/Footer';

/**
 * Rotas que abrem a MESMA página que outro item do menu (lá dentro há separadores).
 * O menu mostra um só item e destaca-o em qualquer uma delas.
 */
const MENU_PATH_ALIASES: Record<string, string> = {
 '/admin/produtos/unidades': '/admin/produtos/categorias',
};
const toMenuPath = (p: string) => MENU_PATH_ALIASES[p.replace(/\/$/, '')] || p;


const BASE_PATH = '/';

interface LayoutProps {
 children: React.ReactNode;
 currentUser: User;
 activePage: string;
 onNavigate: (page: string) => void;
 onLogout: () => void;
 isDarkMode: boolean;
 toggleTheme: () => void;
}

// Itens que não aparecem no menu do telemóvel (as páginas continuam acessíveis)
const MOBILE_MENU_HIDDEN = new Set(['tracking', 'subscriptions', 'helpdesk']);

/** Texto comparável: sem acentos e em minúsculas ("Logística" ≈ "logistica"). */

export const Layout: React.FC<LayoutProps> = ({
 children,
 currentUser,
 activePage,
 onNavigate,
 onLogout,
 isDarkMode,
 toggleTheme
}) => {
 const navigate = useNavigate();
 const { t, language, setLanguage } = useLanguage();
 const { hasPermission } = usePermissions(currentUser);
 const isMobile = useMobile(768);
 const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
 const [userMenuOpen, setUserMenuOpen] = useState(false);
 // Removed duplicate state


 // Estado do sidebar com persistência no localStorage
 const [sidebarOpen, setSidebarOpen] = useState(() => {
 const saved = localStorage.getItem('sidebarOpen');
 return saved ? saved === 'true' : false; // Padrão: fechado
 });

 // Salvar estado do sidebar no localStorage quando mudar
 useEffect(() => {
 localStorage.setItem('sidebarOpen', String(sidebarOpen));
 }, [sidebarOpen]);

 const toggleSidebar = () => {
 setSidebarOpen(prev => !prev);
 };

 // Obter pathname atual
 const location = useLocation();

 // Submenu item interface
 interface SubMenuItem {
 id: string;
 label: string;
 icon?: any;
 path: string;
 }

 // Main menu item interface with optional children
 interface MenuItem {
 id: string;
 label: string;
 icon: any;
 permission: string;
 children?: SubMenuItem[];
 group?: string;
 }

 // Rótulos das secções do menu (igual ao Sidebar)
 const GROUP_LABELS: Record<string, string> = {
 geral: 'Geral',
 comercial: 'Comercial',
 marketing: 'Marketing & CRM',
 financas: 'Finanças',
 gestao: 'Equipa & Gestão',
 servicos: 'Serviços',
 };

 // Estrutura do menu com submenus, organizada por secções (igual ao Sidebar)
 const allMenuItems: MenuItem[] = [
 // ── Geral ──────────────────────────────────────────────────────────
 { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard, permission: 'dashboard.view', group: 'geral' },
 { id: 'tracking', label: t.nav.statistics, icon: Activity, permission: 'analytics.view', group: 'geral' },

 // ── Comercial ──────────────────────────────────────────────────────
 {
 id: 'sales',
 label: t.nav.sales,
 icon: TrendingUp,
 permission: 'sales.view',
 group: 'comercial',
 children: [
 { id: 'pos-sell', label: 'Vender', icon: CreditCard, path: '/admin/pos' },
 { id: 'caixa', label: 'Caixa', icon: Store, path: '/admin/caixa' },
 { id: 'sales-orders', label: t.nav.orders, icon: ShoppingCart, path: '/admin/vendas/pedidos' },
 { id: 'cotacoes', label: 'Cotações', icon: FileText, path: '/admin/cotacoes' },
 { id: 'sales-customers', label: t.nav.customers, icon: Users, path: '/admin/vendas/clientes' },
 { id: 'sales-summaries', label: 'Resumos', icon: List, path: '/admin/vendas' },
 { id: 'sales-by-product', label: 'Por Produto', icon: Package, path: '/admin/vendas/por-produto' },
 ]
 },
 {
 id: 'purchases',
 label: t.nav.purchases,
 icon: ShoppingBag,
 permission: 'purchases.view',
 group: 'comercial',
 children: [
 { id: 'purchases-list', label: 'Compras', icon: ShoppingBag, path: '/admin/compras' },
 { id: 'purchases-by-product', label: 'Por Produto', icon: Package, path: '/admin/compras/por-produto' },
 { id: 'purchases-suppliers', label: 'Fornecedores', icon: Truck, path: '/admin/compras/fornecedores' },
 ]
 },
 {
 id: 'products',
 label: t.nav.products,
 icon: Package,
 permission: 'products.view',
 group: 'comercial',
 children: [
 { id: 'products-list', label: 'Produtos', icon: Package, path: '/admin/produtos' },
 { id: 'products-categories', label: 'Categorias e unidades', icon: Tag, path: '/admin/produtos/categorias' },
 { id: 'products-labels', label: 'Etiquetas', icon: ClipboardCheck, path: '/admin/produtos/etiquetas' },
 ]
 },
 {
 id: 'stock-management',
 label: t.nav.stock,
 icon: BarChart3,
 permission: 'products.view',
 group: 'comercial',
 children: [
 { id: 'stock-products', label: 'Stock e movimentos', icon: Package, path: '/admin/stock' },
 { id: 'stock-alerts', label: 'Alertas', icon: AlertTriangle, path: '/admin/stock/alertas' },
 { id: 'stock-lots', label: 'Lotes', icon: Boxes, path: '/admin/stock/lotes' },
 { id: 'stock-audit', label: 'Auditoria', icon: ClipboardCheck, path: '/admin/stock/auditoria' },
 { id: 'stock-adjustments', label: 'Ajustes', icon: Scale, path: '/admin/stock/ajustes' },
 ]
 },
 { id: 'media', label: t.nav.gallery, icon: Image, permission: 'media.view', group: 'comercial' },
 { id: 'delivery-zones', label: 'Zonas de Entrega', icon: MapPin, permission: 'logistics.manage', group: 'comercial' },
 { id: 'logistics', label: 'Logística', icon: Truck, permission: 'logistics.manage', group: 'comercial' },
 { id: 'refunds', label: 'Reembolsos', icon: Repeat, permission: 'orders.view', group: 'comercial' },

 // ── Marketing & CRM ────────────────────────────────────────────────
 { id: 'marketing', label: 'Marketing', icon: Megaphone, permission: 'sales.view', group: 'marketing' },
 { id: 'coupons', label: 'Cupões', icon: Tag, permission: 'sales.discount', group: 'marketing' },
 { id: 'affiliates', label: 'Afiliados', icon: Share2, permission: 'users.view', group: 'marketing' },
 { id: 'blog', label: 'Blog', icon: FileText, permission: 'media.view', group: 'marketing' },
 { id: 'reviews', label: 'Avaliações', icon: MessageSquare, permission: 'sales.view', group: 'marketing' },

 // ── Finanças ───────────────────────────────────────────────────────
 { id: 'financas', label: 'Finanças', icon: Wallet, permission: 'finance.view', group: 'financas', children: [
  { id: 'financas-iva', label: 'IVA / Configuração', icon: Wallet, path: '/admin/financas' },
  { id: 'invoices', label: 'Faturas', icon: ClipboardCheck, path: '/admin/faturas' },
  { id: 'ap', label: 'Contas a Pagar', icon: Building2, path: '/admin/contas-pagar' },
  { id: 'ledger', label: 'Razão Geral', icon: BookOpen, path: '/admin/razao-geral' },
 ] },

 // ── Equipa & Gestão ────────────────────────────────────────────────
 {
 id: 'users',
 label: t.nav.users,
 icon: Users,
 permission: 'users.view',
 group: 'gestao',
 children: [
 { id: 'users-list', label: 'Usuários', icon: Users, path: '/admin/usuarios' },
 { id: 'users-roles', label: 'Gerir Roles', icon: Shield, path: '/admin/usuarios/roles' },
 ]
 },
 { id: 'hr', label: 'Recursos Humanos', icon: UserCog, permission: 'hr.view', group: 'gestao' },
 { id: 'projects', label: 'Projectos', icon: FolderKanban, permission: 'projects.view', group: 'gestao' },
 { id: 'helpdesk', label: 'Central de Ajuda', icon: Headphones, permission: 'helpdesk.view', group: 'gestao' },
 { id: 'assistant', label: 'Assistente IA', icon: Bot, permission: 'system.backup', group: 'gestao' },
 { id: 'messaging', label: 'Mensagens', icon: MessageSquare, permission: 'messaging.view', group: 'gestao' },
 { id: 'documents', label: 'Documentos', icon: FolderOpen, permission: 'documents.view', group: 'gestao' },

 // ── Serviços ───────────────────────────────────────────────────────
 { id: 'subscriptions', label: 'Assinaturas', icon: RefreshCw, permission: 'subscriptions.view', group: 'servicos' },
 { id: 'clinic', label: 'Clínica', icon: HeartPulse, permission: 'clinic.view', group: 'servicos' },
 ];

 // State for enabled modules - using generic record logic like Sidebar
 const [enabledModules, setEnabledConfig] = useState<Record<string, boolean>>({});

 // Carregar módulos habilitados do local storage (consistente com Sidebar)
 useEffect(() => {
 const loadModulesConfig = () => {
 try {
 const stored = localStorage.getItem('system_modules_config');
 if (stored) {
 setEnabledConfig(JSON.parse(stored));
 } else {
 setEnabledConfig({});
 }
 } catch (e) {
 console.warn('Error parsing modules config', e);
 }
 };

 loadModulesConfig();

 const handleUpdate = () => loadModulesConfig();
 window.addEventListener('modules_updated', handleUpdate);
 return () => window.removeEventListener('modules_updated', handleUpdate);
 }, []);

 // Helper to check if a module is enabled (Shared logic from Sidebar)
 const isModuleEnabled = (moduleId: string) => {
 if (Object.keys(enabledModules).length === 0) return true;

 const moduleMap: Record<string, string> = {
 'dashboard': 'dashboard',
 'orders': 'orders',
 'sales': 'sales',
 'customers': 'customers',
 'purchases': 'purchases',
 'products': 'products',
 'stock-management': 'stock-management',
 'media': 'media',
 'users': 'users',
 'tracking': 'dashboard',
 'financas': 'financas',
 'logistics': 'logistics',
 'coupons': 'sales',
 'refunds': 'orders',
 'affiliates': 'affiliates',
 'marketing': 'marketing',
 'blog': 'media',
 'delivery-zones': 'logistics',
 // Novos módulos sempre activados se não houver config
 'hr': 'hr',
 'projects': 'projects',
 'helpdesk': 'helpdesk',
 'messaging': 'messaging',
 'subscriptions': 'subscriptions',
 'documents': 'documents',
 };

 const configId = moduleMap[moduleId];
 if (!configId) return true;

 return enabledModules[configId] !== false;
 };

 // Módulos administrativos que sempre aparecem para admins (mesmo com "all" selecionado)
 const adminModules = new Set(['users', 'roles', 'locations-management', 'admin-tracking', 'media', 'profile']);

 // Filtrar itens baseado apenas nas permissões (sincronizado com o Sidebar)
 const filteredMenuItems = useMemo(() => {
 return allMenuItems.filter(item => {
 // 1. Check Module status
 if (!isModuleEnabled(item.id)) return false;

 // 2. Check Permission
 if (!item.permission) return true;
 return hasPermission(item.permission);
 });
 }, [hasPermission, t, enabledModules]);

 // Menu do telemóvel: sem Estatísticas e Assinaturas (as páginas continuam acessíveis pelo URL)
 const mobileMenuItems = useMemo(
 () => filteredMenuItems.filter(item => !MOBILE_MENU_HIDDEN.has(item.id)),
 [filteredMenuItems]
 );

 const handleNavigate = (page: string) => {
 onNavigate(page);
 setMobileMenuOpen(false);
 };

 const handleLogout = () => {
 onLogout();
 setUserMenuOpen(false);
 setMobileMenuOpen(false);
 };

 // Calcular margin-left do conteúdo baseado no estado do sidebar
 const sidebarWidth = sidebarOpen ? 256 : 80; // 64px (w-20) quando fechado, 256px (w-64) quando aberto

 return (
 <div className="min-h-screen bg-surface-base flex transition-colors duration-300">
 {/* Desktop Sidebar */}
 {activePage !== 'shop' && (
 <Sidebar
 currentUser={currentUser}
 activePage={activePage}
 onNavigate={onNavigate}
 onLogout={handleLogout}
 isDarkMode={isDarkMode}
 isOpen={sidebarOpen}
 onToggle={toggleSidebar}
 />
 )}

 {/* Mobile Header */}
 {activePage !== 'shop' && (
 <div
 className="md:hidden fixed top-0 inset-x-0 bg-surface-raised/95 backdrop-blur-xl z-30 border-b border-border-default overflow-visible"
 style={{ paddingTop: 'env(safe-area-inset-top)', boxShadow: '0 4px 24px -12px rgba(48,49,61,0.18)' }}
 >
 <div className="px-4 h-14 flex justify-between items-center relative">
 {/* Logo */}
 <div className="flex items-center min-w-0 flex-1">
 <button
 onClick={() => {
 navigate('/admin');
 }}
 className="tap-target flex-shrink-0 cursor-pointer hover:opacity-80 active:opacity-70 transition-opacity touch-manipulation"
 aria-label="Ir para o painel"
 >
 <Logo variant="full" width={128} height={36} className="h-9 w-auto max-w-[128px] object-contain" isDarkMode={isDarkMode} />
 </button>
 </div>

 {/* Right side buttons */}
 <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0 relative">
 {/* User Menu Button */}
 <div className="relative z-50">
 <button
 onClick={() => {
 setUserMenuOpen(!userMenuOpen);
 setMobileMenuOpen(false);
 }}
 className="flex items-center space-x-2 px-2 py-1.5 rounded-xl active:bg-surface-raised hover:bg-surface-raised/50 transition-all touch-manipulation min-h-[44px]"
 aria-label="Menu do usuário"
 >
 <div className="border-2 border-border-strong rounded-full shadow-sm">
 <Avatar
 src={currentUser.avatar}
 alt={currentUser.name}
 name={currentUser.name}
 size="md"
 />
 </div>
 <div className="hidden sm:flex flex-col items-start min-w-0">
 <span className="text-sm font-semibold text-content-primary truncate max-w-[120px]">
 {currentUser.name.split(' ')[0]}
 </span>
 <span className="text-xs text-content-muted truncate max-w-[120px]">
 {currentUser.name.split(' ').slice(1).join(' ') || ' '}
 </span>
 </div>
 <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-content-secondary transition-transform flex-shrink-0 ${userMenuOpen ? 'rotate-180' : ''}`} />
 </button>

 {/* User Dropdown Menu */}
 {userMenuOpen && (
 <>
 <div
 className="fixed inset-0 z-[50]"
 onClick={() => setUserMenuOpen(false)}
 />
 <div className="fixed right-2 top-[64px] sm:absolute sm:right-0 sm:top-auto sm:mt-2 w-[calc(100vw-1rem)] sm:w-[90vw] sm:max-w-sm bg-surface-raised rounded-xl shadow-2xl border border-border-default z-[70] overflow-hidden max-h-[calc(100vh-120px)] overflow-y-auto">
 <div className="p-4 border-b border-border-default bg-gradient-to-r from-brand-50 to-transparent dark:from-brand-900/20">
 <div className="flex items-center space-x-3">
 <div className="border-2 border-brand-200 dark:border-brand-700 rounded-full shadow-sm">
 <Avatar
 src={currentUser.avatar}
 alt={currentUser.name}
 name={currentUser.name}
 size="lg"
 />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-base font-semibold text-content-primary truncate">{currentUser.name}</p>
 <p className="text-xs text-content-muted truncate mt-0.5">{currentUser.email}</p>
 <p className="text-xs text-brand-600 dark:text-brand-400 mt-1 font-medium">
 {currentUser.roleDisplayName || (currentUser.role === UserRole.ADMIN ? t.ui.admin : t.ui.staff)}
 </p>
 </div>
 </div>
 </div>
 <div className="p-2">
 <button
 onClick={() => {
 setUserMenuOpen(false);
 setMobileMenuOpen(false);
 onNavigate('profile');
 }}
 className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium text-content-secondary hover:bg-surface-raised rounded-lg transition-colors touch-manipulation min-h-[44px]"
 >
 <UserIcon className="w-5 h-5" />
 <span>Meu Perfil</span>
 </button>
 <div className="flex gap-1 px-4 py-2">
 <button
 onClick={() => setLanguage('pt')}
 className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${language === 'pt' ? 'bg-brand-600/10 dark:bg-brand-600/20 text-brand-700 dark:text-brand-300 ' : 'text-content-secondary hover:bg-surface-raised'}`}
 >
 PT
 </button>
 <button
 onClick={() => setLanguage('en')}
 className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${language === 'en' ? 'bg-brand-600/10 dark:bg-brand-600/20 text-brand-700 dark:text-brand-300 ' : 'text-content-secondary hover:bg-surface-raised'}`}
 >
 EN
 </button>
 </div>
 <button
 onClick={() => {
 setUserMenuOpen(false);
 setMobileMenuOpen(false);
 navigate('/');
 }}
 className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium text-content-secondary hover:bg-surface-raised rounded-lg transition-colors touch-manipulation min-h-[44px]"
 >
 <Globe className="w-5 h-5" />
 <span>Voltar ao Site</span>
 </button>
 <button
 onClick={handleLogout}
 className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors touch-manipulation min-h-[44px] mt-1"
 >
 <LogOut className="w-5 h-5" />
 <span>{t.auth.logout}</span>
 </button>
 </div>
 </div>
 </>
 )}
 </div>

 {/* O menu de navegação abre pela barra inferior (zona do polegar) */}
 </div>
 </div>
 </div>
 )}

 {/* Mobile Menu Sidebar */}
 {/* Menu do telemóvel: lista agrupada com sub-páginas (MobileAdminMenu) */}
 {mobileMenuOpen && (
 <MobileAdminMenu
 items={mobileMenuItems}
 groupLabels={GROUP_LABELS}
 currentUser={currentUser}
 activePage={activePage}
 currentPath={toMenuPath(location.pathname)}
 language={language}
 onSetLanguage={setLanguage}
 onNavigateItem={handleNavigate}
 onNavigatePath={(path) => { navigate(path); setMobileMenuOpen(false); }}
 onOpenProfile={() => { navigate('/admin/perfis'); setMobileMenuOpen(false); }}
 onGoToSite={() => { setMobileMenuOpen(false); navigate('/'); }}
 onLogout={handleLogout}
 onClose={() => setMobileMenuOpen(false)}
 logoutLabel={t.auth.logout}
 />
 )}

 {/* Mobile Bottom Navigation (zona do polegar) */}
 {activePage !== 'shop' && (
 <AdminBottomNavigation
 currentUser={currentUser}
 isMenuOpen={mobileMenuOpen}
 onOpenMenu={() => {
 setMobileMenuOpen(prev => !prev);
 setUserMenuOpen(false);
 }}
 />
 )}

 {/* Main Content */}
 <main
 className={`flex-1 min-w-0 p-4 md:p-8 ${activePage === 'shop' ? 'pt-0 pb-24' : 'admin-main-mobile md:pt-4'} md:pb-8 overflow-x-hidden text-content-primary transition-all duration-300`}
 style={{ marginLeft: (!isMobile && activePage !== 'shop') ? `${sidebarWidth}px` : '0' }}
 >
 <RouteTransition variant="fade">{children}</RouteTransition>
 </main>

 </div>
 );
};

