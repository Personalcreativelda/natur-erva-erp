import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMobile } from '../../hooks/useMobile';

/**
 * Secções de uma página (antes: separadores feitos à mão em cada página, com estilos diferentes).
 *
 *  • Computador: barra de separadores sublinhada, igual em todas as páginas.
 *  • Telemóvel/app: lista agrupada com navegação em profundidade (como uma app nativa):
 *      visão geral (indicadores da página + lista de secções "ícone · nome · ›")
 *        → tocar numa secção abre-a com "‹ Voltar"
 *    A secção fica no URL (?secao=…), por isso o Voltar do Android regressa à lista.
 *
 * Uso numa página:
 *   const nav = useSectionNav(sections, tab, setTab);
 *   {!nav.sectionMode && <Indicadores/>}              // só na visão geral
 *   <div className="card"><SectionNav nav={nav} />{!nav.listMode && conteúdo}</div>
 */

export interface SectionItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Linha secundária na lista do telemóvel */
  description?: string;
  /** Contador (ex.: pedidos pendentes) */
  badge?: number | string;
}

export interface SectionNavState {
  sections: SectionItem[];
  active: string;
  isMobile: boolean;
  /** Telemóvel, sem secção aberta → mostrar a lista de secções (esconder o conteúdo) */
  listMode: boolean;
  /** Telemóvel, dentro de uma secção → esconder a visão geral (indicadores, etc.) */
  sectionMode: boolean;
  open: (id: string) => void;
  back: () => void;
}

const PARAM = 'secao';

export function useSectionNav(sections: SectionItem[], active: string, onChange: (id: any) => void): SectionNavState {
  const isMobile = useMobile(768);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const urlId = params.get(PARAM);
  const current = urlId && sections.some(s => s.id === urlId) ? urlId : null;

  // URL → página (inclui o Voltar do Android e links directos)
  useEffect(() => {
    if (current && current !== active) onChangeRef.current(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const open = useCallback((id: string) => {
    if (isMobile) {
      // Entrar numa secção é um passo no histórico (o Voltar regressa à lista)
      const next = new URLSearchParams(params);
      next.set(PARAM, id);
      setParams(next, { state: { sectionNav: true } });
      window.scrollTo(0, 0);
    } else {
      onChangeRef.current(id);
      const next = new URLSearchParams(params);
      next.set(PARAM, id);
      setParams(next, { replace: true });
    }
  }, [isMobile, params, setParams]);

  const back = useCallback(() => {
    if ((location.state as { sectionNav?: boolean } | null)?.sectionNav) {
      navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete(PARAM);
      setParams(next, { replace: true });
    }
  }, [location.state, navigate, params, setParams]);

  return {
    sections,
    active,
    isMobile,
    listMode: isMobile && !current,
    sectionMode: isMobile && !!current,
    open,
    back,
  };
}

const Badge: React.FC<{ value?: number | string }> = ({ value }) =>
  value ? (
    <span className="ml-1 inline-flex min-w-5 h-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white">{value}</span>
  ) : null;

/**
 * Barra (computador) / lista ou cabeçalho "‹ Voltar" (telemóvel).
 * @param card  desenha o próprio cartão (para páginas em que a barra não está dentro de um cartão)
 */
export const SectionNav: React.FC<{ nav: SectionNavState; card?: boolean; listTitle?: string }> = ({ nav, card = false, listTitle }) => {
  const wrap = (children: React.ReactNode, extra = '') =>
    card ? <div className={`overflow-hidden rounded-2xl border border-border-default bg-surface-raised ${extra}`}>{children}</div> : <>{children}</>;

  // ── Telemóvel: lista de secções ─────────────────────────────────────────────
  if (nav.listMode) {
    return wrap(
      <nav aria-label={listTitle || 'Secções'}>
        {listTitle && <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-content-muted">{listTitle}</p>}
        <ul className="divide-y divide-border-default">
          {nav.sections.map(s => {
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => nav.open(s.id)}
                  className="flex w-full min-h-[56px] items-center gap-3 px-4 py-3 text-left active:bg-surface-overlay touch-manipulation">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700 dark:bg-brand-400/15 dark:text-brand-300" aria-hidden="true">
                    {Icon ? <Icon className="h-[18px] w-[18px]" /> : <span className="text-sm font-bold">{s.label.charAt(0)}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center text-[15px] font-medium text-content-primary">
                      <span className="truncate">{s.label}</span><Badge value={s.badge} />
                    </span>
                    {s.description && <span className="block truncate text-xs text-content-muted">{s.description}</span>}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-content-muted/60" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  // ── Telemóvel: dentro de uma secção ─────────────────────────────────────────
  if (nav.sectionMode) {
    const s = nav.sections.find(x => x.id === nav.active);
    return wrap(
      <div className={`flex items-center gap-1 px-2 py-2 ${card ? '' : 'border-b border-border-default'}`}>
        <button type="button" onClick={nav.back} aria-label="Voltar às secções"
          className="flex h-10 items-center gap-0.5 rounded-full pl-1 pr-2.5 text-sm font-medium text-brand-700 active:bg-surface-overlay dark:text-brand-300">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Voltar
        </button>
        <h2 className="min-w-0 flex-1 truncate pr-2 text-right text-base font-semibold text-content-primary">{s?.label}</h2>
      </div>
    );
  }

  // ── Computador: separadores ─────────────────────────────────────────────────
  return wrap(
    <div className={`flex overflow-x-auto scrollbar-hide ${card ? '' : 'border-b border-border-default'}`} role="tablist">
      {nav.sections.map(s => {
        const Icon = s.icon;
        const on = s.id === nav.active;
        return (
          <button key={s.id} type="button" role="tab" aria-selected={on} onClick={() => nav.open(s.id)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
              on ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400' : 'border-transparent text-content-muted hover:text-content-primary'}`}>
            {Icon && <Icon className="h-4 w-4" />}{s.label}<Badge value={s.badge} />
          </button>
        );
      })}
    </div>
  );
};

export default SectionNav;
