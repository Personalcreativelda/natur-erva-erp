/**
 * "Puxar para actualizar" (pull-to-refresh) na app Android — a WebView não o tem de origem.
 *
 * Puxar para baixo quando a página está no topo mostra um indicador; ao largar depois do limite,
 * dispara `app:refresh`: limpa as caches de dados e as páginas recarregam só o CONTEÚDO
 * (useRefreshKey nos layouts) — sem recarregar a app inteira nem repetir os ecrãs de arranque.
 *
 * Não actua dentro de modais/painéis (camadas fixas) nem em listas com scroll próprio já deslocadas.
 */
import { queryClient } from '../lib/queryClient';
import { dataService } from '../services/dataService';

export const APP_REFRESH_EVENT = 'app:refresh';

const THRESHOLD = 70;   // px puxados (já com resistência) para disparar
const MAX_PULL = 110;
const RESISTANCE = 0.5;
const MIN_SPIN_MS = 650;
const MAX_WAIT_MS = 6000;

/** Verdadeiro se o toque começou num sítio onde o gesto não deve actuar. */
function blockedTarget(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const s = getComputedStyle(el);
    if (s.position === 'fixed' && !el.matches('header, [data-ptr-allow]')) return true; // modal, gaveta, menu
    if (el.scrollTop > 0 && /(auto|scroll)/.test(s.overflowY)) return true;            // lista com scroll próprio
    if (el.matches('input[type=range], [data-ptr-ignore], .pos-mobile-viewport')) return true;
    el = el.parentElement;
  }
  return false;
}

function createIndicator(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = [
    'position:fixed', 'left:50%', 'top:0', 'z-index:2147483000', 'width:40px', 'height:40px',
    'margin-left:-20px', 'border-radius:9999px', 'display:flex', 'align-items:center', 'justify-content:center',
    'background:var(--surface-raised,#fff)', 'box-shadow:0 4px 14px rgba(0,0,0,.18)',
    'transform:translateY(-60px)', 'opacity:0', 'pointer-events:none', 'will-change:transform',
  ].join(';');
  el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600,#16a34a)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>`;
  document.body.appendChild(el);
  return el;
}

/** Limpa caches, avisa a app e espera (com limite) que os pedidos em curso terminem. */
export async function runAppRefresh(): Promise<void> {
  const started = Date.now();
  try { dataService.clearCache(); } catch { /* sem cache */ }
  await queryClient.invalidateQueries().catch(() => {});
  window.dispatchEvent(new CustomEvent(APP_REFRESH_EVENT));
  // Dá tempo às páginas para começarem a carregar e espera que terminem
  await new Promise(r => setTimeout(r, 150));
  while (queryClient.isFetching() > 0 && Date.now() - started < MAX_WAIT_MS) {
    await new Promise(r => setTimeout(r, 120));
  }
  const elapsed = Date.now() - started;
  if (elapsed < MIN_SPIN_MS) await new Promise(r => setTimeout(r, MIN_SPIN_MS - elapsed));
}

export function installPullToRefresh(): () => void {
  const root = document.documentElement;
  const prevOverscroll = root.style.overscrollBehaviorY;
  root.style.overscrollBehaviorY = 'none'; // sem o brilho/ressalto nativo por cima do nosso indicador

  let indicator: HTMLDivElement | null = null;
  let startY = 0, startX = 0, pull = 0;
  let tracking = false, decided = false, refreshing = false;

  const show = (distance: number, spinning = false) => {
    indicator = indicator || createIndicator();
    const y = Math.min(distance, MAX_PULL) - 50;
    const progress = Math.min(distance / THRESHOLD, 1);
    indicator.style.transition = spinning || distance === 0 ? 'transform .25s ease, opacity .25s ease' : 'none';
    indicator.style.transform = `translateY(${y}px) rotate(${spinning ? 0 : progress * 270}deg)`;
    indicator.style.opacity = String(distance === 0 ? 0 : Math.max(0.3, progress));
    const svg = indicator.firstElementChild as SVGElement | null;
    if (svg) svg.style.animation = spinning ? 'spin .8s linear infinite' : 'none';
  };

  const onStart = (e: TouchEvent) => {
    if (refreshing || e.touches.length !== 1 || window.scrollY > 0) { tracking = false; return; }
    if (root.classList.contains('keyboard-open') || blockedTarget(e.target)) { tracking = false; return; }
    tracking = true; decided = false; pull = 0;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  };

  const onMove = (e: TouchEvent) => {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;
    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided = true;
      // Gesto horizontal (carrosséis) ou para cima → não é nosso
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) { tracking = false; return; }
    }
    if (window.scrollY > 0) { tracking = false; show(0); return; }
    pull = Math.max(0, dy * RESISTANCE);
    show(pull);
  };

  const onEnd = async () => {
    if (!tracking) return;
    tracking = false;
    if (pull < THRESHOLD) { show(0); return; }
    refreshing = true;
    show(THRESHOLD, true);
    try { await runAppRefresh(); } finally {
      refreshing = false;
      show(0);
    }
  };

  window.addEventListener('touchstart', onStart, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: true });
  window.addEventListener('touchend', onEnd, { passive: true });
  window.addEventListener('touchcancel', onEnd, { passive: true });
  return () => {
    window.removeEventListener('touchstart', onStart);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onEnd);
    window.removeEventListener('touchcancel', onEnd);
    root.style.overscrollBehaviorY = prevOverscroll;
    indicator?.remove();
  };
}
