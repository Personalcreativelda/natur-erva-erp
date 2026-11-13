import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, LogOut, Search, X } from 'lucide-react';
import { Avatar } from '../ui/Avatar';

/**
 * Menu do painel no telemóvel/app — lista agrupada com navegação em profundidade
 * (padrão das Definições do iOS/Android, Shopify, Stripe):
 *   nível 1 → cartões por secção (Geral, Comercial, …) com linhas "ícone · nome · ›"
 *   nível 2 → itens com sub-páginas (ex.: Finanças › IVA, Faturas…) abrem um ecrã próprio com ← Voltar
 *
 * Cada nível é uma camada fixa própria: o botão Voltar do Android (closeTopOverlay) fecha só a de
 * cima — no submenu volta ao menu; no menu, fecha-o. A barra inferior do painel fica visível.
 */

export interface MobileMenuChild { id: string; label: string; icon?: any; path: string }
export interface MobileMenuItem { id: string; label: string; icon: any; group?: string; children?: MobileMenuChild[] }

interface Props {
  items: MobileMenuItem[];
  groupLabels: Record<string, string>;
  currentUser: { name?: string; email?: string; avatar?: string; role?: string; roles?: string[] };
  activePage: string;
  currentPath: string;
  language: string;
  onSetLanguage: (lang: 'pt' | 'en') => void;
  onNavigateItem: (id: string) => void;
  onNavigatePath: (path: string) => void;
  onOpenProfile: () => void;
  onGoToSite: () => void;
  onLogout: () => void;
  onClose: () => void;
  logoutLabel: string;
}

// Cor do ícone por secção (como as apps nativas): ajuda a encontrar a secção de relance
const GROUP_TINT: Record<string, string> = {
  geral: 'bg-sky-500',
  comercial: 'bg-emerald-600',
  marketing: 'bg-pink-500',
  financas: 'bg-amber-500',
  gestao: 'bg-indigo-500',
  servicos: 'bg-teal-500',
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Administrador', ADMIN: 'Administrador', GERENTE: 'Gerente', STAFF: 'Equipa',
  VENDEDOR: 'Vendedor', GESTOR_VENDAS: 'Gestor de Vendas', GESTOR_STOCK: 'Gestor de Stock',
  LOGISTICA: 'Logística', CONTABILISTA: 'Contabilista', FINANCEIRO: 'Financeiro', GESTOR_BLOG: 'Gestor do Blog',
};

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toPath = (p: string) => p.replace(/\/+$/, '') || '/';

// Espaço da barra inferior do painel (ver .admin-main-mobile em index.html)
const SHEET_STYLE: React.CSSProperties = {
  paddingTop: 'env(safe-area-inset-top)',
  bottom: 'calc(72px + env(safe-area-inset-bottom))',
};

const IconTile: React.FC<{ icon: any; tint: string }> = ({ icon: Icon, tint }) => (
  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${tint}`} aria-hidden="true">
    {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2} />}
  </span>
);

const Row: React.FC<{
  icon: any; tint: string; label: string; hint?: string; active?: boolean; danger?: boolean;
  chevron?: boolean; onClick: () => void;
}> = ({ icon, tint, label, hint, active, danger, chevron = true, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className="flex w-full min-h-[52px] items-center gap-3 px-4 py-2.5 text-left active:bg-surface-overlay touch-manipulation"
  >
    <IconTile icon={icon} tint={tint} />
    <span className="min-w-0 flex-1">
      <span className={`block truncate text-[15px] ${danger ? 'text-red-600 dark:text-red-400' : active ? 'font-semibold text-brand-700 dark:text-brand-300' : 'text-content-primary'}`}>
        {label}
      </span>
      {hint && <span className="block truncate text-xs text-content-muted">{hint}</span>}
    </span>
    {active && <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden="true" />}
    {chevron && <ChevronRight className="h-5 w-5 shrink-0 text-content-muted/60" aria-hidden="true" />}
  </button>
);

const Card: React.FC<{ title?: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    {title && <h2 className="px-5 pb-1.5 text-xs font-semibold uppercase tracking-wide text-content-muted">{title}</h2>}
    <div className="mx-4 overflow-hidden rounded-2xl border border-border-default bg-surface-raised divide-y divide-border-default [&>*]:border-border-default">
      {children}
    </div>
  </section>
);

export const MobileAdminMenu: React.FC<Props> = ({
  items, groupLabels, currentUser, activePage, currentPath, language, onSetLanguage,
  onNavigateItem, onNavigatePath, onOpenProfile, onGoToSite, onLogout, onClose, logoutLabel,
}) => {
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const path = toPath(currentPath);

  const isChildActive = (c: MobileMenuChild) => path === toPath(c.path) || path.startsWith(toPath(c.path) + '/');
  const activeChildOf = (item: MobileMenuItem) => {
    const matches = (item.children || []).filter(isChildActive);
    return matches.sort((a, b) => b.path.length - a.path.length)[0] || null;
  };
  const isItemActive = (item: MobileMenuItem) =>
    item.children?.length ? !!activeChildOf(item) : activePage === item.id || activePage.startsWith(item.id + '-');

  // Secções pela ordem em que aparecem
  const groups = useMemo(() => {
    const map = new Map<string, MobileMenuItem[]>();
    for (const item of items) {
      const g = item.group || 'geral';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  // Pesquisa: itens e sub-páginas
  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return null;
    const out: { key: string; label: string; parent?: string; icon: any; tint: string; go: () => void }[] = [];
    for (const item of items) {
      const tint = GROUP_TINT[item.group || 'geral'] || 'bg-slate-500';
      if (item.children?.length) {
        const parentMatch = normalize(item.label).includes(q);
        for (const c of item.children) {
          if (parentMatch || normalize(c.label).includes(q)) {
            out.push({ key: c.id, label: c.label, parent: item.label, icon: c.icon || item.icon, tint, go: () => onNavigatePath(c.path) });
          }
        }
      } else if (normalize(item.label).includes(q)) {
        out.push({ key: item.id, label: item.label, icon: item.icon, tint, go: () => onNavigateItem(item.id) });
      }
    }
    return out;
  }, [query, items, onNavigateItem, onNavigatePath]);

  const openItem = items.find(i => i.id === openItemId) || null;

  // Escape (teclado) fecha o nível de cima
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openItemId) setOpenItemId(null); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openItemId, onClose]);

  const roleLabel = (() => {
    const r = (currentUser.roles?.[0] || currentUser.role || '').toUpperCase();
    return ROLE_LABELS[r] || (r ? r.charAt(0) + r.slice(1).toLowerCase().replace(/_/g, ' ') : '');
  })();

  return (
    <>
      {/* ── Nível 1: menu ─────────────────────────────────────────────────── */}
      <div
        className="md:hidden fixed inset-x-0 top-0 z-[45] flex flex-col bg-surface-base admin-menu-sheet animate-menu-sheet-in"
        style={SHEET_STYLE}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
      >
        <header className="flex h-14 shrink-0 items-center justify-between px-4">
          <h1 className="text-[22px] font-bold tracking-tight text-content-primary">Menu</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="tap-target flex h-10 w-10 items-center justify-center rounded-full bg-surface-overlay text-content-secondary active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain pb-6">
          {/* Pesquisa */}
          <div className="px-4 pb-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-content-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Pesquisar no menu…"
                aria-label="Pesquisar no menu"
                enterKeyHint="search"
                className="h-11 w-full rounded-xl border border-border-default bg-surface-raised pl-11 pr-3 text-content-primary placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          </div>

          {results ? (
            results.length === 0 ? (
              <p className="px-6 py-10 text-center text-[15px] text-content-muted">Nenhum resultado para “{query.trim()}”</p>
            ) : (
              <Card>
                {results.map(r => (
                  <Row key={r.key} icon={r.icon} tint={r.tint} label={r.label} hint={r.parent} onClick={r.go} />
                ))}
              </Card>
            )
          ) : (
            <div className="space-y-6">
              {/* Conta */}
              <Card>
                <button type="button" onClick={onOpenProfile} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-overlay">
                  <Avatar src={currentUser.avatar} alt={currentUser.name || ''} name={currentUser.name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold text-content-primary">{currentUser.name}</span>
                    <span className="block truncate text-sm text-content-muted">{roleLabel || currentUser.email}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-content-muted/60" aria-hidden="true" />
                </button>
              </Card>

              {groups.map(([group, groupItems]) => (
                <Card key={group} title={groupLabels[group] || group}>
                  {groupItems.map(item => {
                    const tint = GROUP_TINT[group] || 'bg-slate-500';
                    const hasChildren = !!item.children?.length;
                    const activeChild = hasChildren ? activeChildOf(item) : null;
                    return (
                      <Row
                        key={item.id}
                        icon={item.icon}
                        tint={tint}
                        label={item.label}
                        hint={hasChildren ? (activeChild ? activeChild.label : (item.children!.length === 1 ? "1 opção" : `${item.children!.length} opções`)) : undefined}
                        active={isItemActive(item)}
                        onClick={() => (hasChildren ? setOpenItemId(item.id) : onNavigateItem(item.id))}
                      />
                    );
                  })}
                </Card>
              ))}

              {/* Preferências e sessão */}
              <Card title="Conta">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <IconTile icon={Globe} tint="bg-slate-500" />
                  <span className="flex-1 text-[15px] text-content-primary">Idioma</span>
                  <div className="flex rounded-lg bg-surface-overlay p-0.5" role="group" aria-label="Idioma">
                    {(['pt', 'en'] as const).map(l => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => onSetLanguage(l)}
                        aria-pressed={language === l}
                        className={`h-8 min-w-[44px] rounded-md px-3 text-sm font-semibold ${language === l ? 'bg-surface-raised text-content-primary shadow-sm' : 'text-content-muted'}`}
                      >
                        {l.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <Row icon={Globe} tint="bg-emerald-600" label="Ir para a loja" onClick={onGoToSite} />
                <Row icon={LogOut} tint="bg-red-500" label={logoutLabel} danger chevron={false} onClick={onLogout} />
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* ── Nível 2: sub-páginas de um item ───────────────────────────────── */}
      {openItem && (
        <div
          className="md:hidden fixed inset-x-0 top-0 z-[46] flex flex-col bg-surface-base admin-menu-sheet animate-menu-push-in"
          style={SHEET_STYLE}
          role="dialog"
          aria-modal="true"
          aria-label={openItem.label}
        >
          <header className="flex h-14 shrink-0 items-center gap-1 px-2">
            <button
              type="button"
              onClick={() => setOpenItemId(null)}
              aria-label="Voltar"
              className="tap-target flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-brand-700 dark:text-brand-300 active:bg-surface-overlay"
            >
              <ChevronLeft className="h-6 w-6" /> <span className="text-[15px] font-medium">Menu</span>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain pb-6">
            <h1 className="px-5 pb-4 text-[22px] font-bold tracking-tight text-content-primary">{openItem.label}</h1>
            <Card>
              {openItem.children!.map(c => (
                <Row
                  key={c.id}
                  icon={c.icon || openItem.icon}
                  tint={GROUP_TINT[openItem.group || 'geral'] || 'bg-slate-500'}
                  label={c.label}
                  active={activeChildOf(openItem)?.id === c.id}
                  onClick={() => onNavigatePath(c.path)}
                />
              ))}
            </Card>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileAdminMenu;
