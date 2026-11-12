import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { exitApp, getLaunchUrl, isNativeApp, onAndroidBack, onAppUrlOpen, onKeyboardChange, setSystemBarsDark } from './native';
import { installNativeFileBridge } from './nativeFiles';
import { closeTopOverlay } from './overlays';

/**
 * Comportamentos de "app nativa", montado uma vez dentro do Router. Não renderiza nada.
 *  - Botão Voltar do Android: fecha o painel aberto → volta atrás → início da área → sair (2 toques).
 *  - Scroll: página nova abre no topo; ao voltar, repõe a posição anterior (ex.: lista de produtos).
 *  - Teclado virtual: <html class="keyboard-open"> para esconder barras fixas inferiores.
 *  - <html class="native-app"> dentro da app Android, para CSS específico.
 */

const EXIT_WINDOW_MS = 2000;
const KEYBOARD_MIN_PX = 150;

const isEditable = (el: Element | null): boolean =>
  !!el && (el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable ||
    (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/i.test((el as HTMLInputElement).type)));

export const MobileShell: React.FC = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // ── marca a app nativa ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNativeApp()) return;
    const root = document.documentElement;
    root.classList.add('native-app');
    // Barra de estado acompanha o modo escuro do site (classe "dark" no <html>)
    let dark = root.classList.contains('dark');
    setSystemBarsDark(dark);
    const mo = new MutationObserver(() => {
      const next = root.classList.contains('dark');
      if (next !== dark) { dark = next; setSystemBarsDark(dark); }
    });
    mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  // ── transferências (PDF/Excel) e impressão nativas ───────────────────────────
  useEffect(() => {
    installNativeFileBridge((msg, type) => showToast(msg, type));
  }, [showToast]);

  // ── links do site abertos a partir de outras apps (deep links) ───────────────
  useEffect(() => {
    const SITE = /^https:\/\/(www\.)?natur-erva\.co\.mz/i;
    const open = (url: string | null) => {
      if (!url || !SITE.test(url)) return;
      const u = new URL(url);
      const target = u.pathname + u.search + u.hash;
      if (target !== window.location.pathname + window.location.search + window.location.hash) navigate(target);
    };
    getLaunchUrl().then(open);
    let handle: { remove: () => unknown } | null = null;
    let disposed = false;
    onAppUrlOpen(open).then(h => { if (disposed) h?.remove(); else handle = h; });
    return () => { disposed = true; handle?.remove(); };
  }, [navigate]);

  // ── scroll: topo em páginas novas, posição reposta ao voltar ────────────────
  const positions = useRef(new Map<string, number>());
  const currentKey = useRef(location.key);
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => positions.current.set(currentKey.current, window.scrollY));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    currentKey.current = location.key;
    const pathChanged = prevPath.current !== location.pathname;
    prevPath.current = location.pathname;
    if (location.hash) return; // a página trata da âncora (ex.: #produtos-section)

    if (navType === 'POP') {
      const y = positions.current.get(location.key);
      if (y == null) return;
      // O conteúdo pode ainda estar a carregar: tenta até a página ter altura suficiente (máx. ~1,5 s)
      let tries = 0, timer = 0;
      const restore = () => {
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo(0, Math.min(y, Math.max(0, maxY)));
        if (maxY < y && tries++ < 25) timer = window.setTimeout(restore, 60);
      };
      restore();
      return () => clearTimeout(timer);
    }
    // Só ao mudar de página — filtros na mesma página (query string) não saltam para o topo
    if (pathChanged) window.scrollTo(0, 0);
  }, [location.key, location.pathname, location.hash, navType]);

  // ── teclado virtual ──────────────────────────────────────────────────────────
  useEffect(() => {
    const root = document.documentElement;
    const set = (open: boolean) => root.classList.toggle('keyboard-open', open);
    let pluginHandles: { remove: () => unknown }[] | null = null;
    let disposed = false;

    onKeyboardChange(set).then(h => {
      if (disposed) h?.forEach(x => x.remove());
      else pluginHandles = h;
    });

    // Fallback (browser e APKs sem o plugin): a área visível encolhe quando o teclado abre
    if (!window.matchMedia('(pointer: coarse)').matches) return () => { disposed = true; };
    const vv = window.visualViewport;
    let baseline = 0;
    const measure = () => {
      if (pluginHandles) return;
      const h = vv?.height ?? window.innerHeight;
      if (!isEditable(document.activeElement)) { baseline = Math.max(h, window.innerHeight); set(false); return; }
      baseline = Math.max(baseline, window.innerHeight);
      set(baseline - h > KEYBOARD_MIN_PX);
    };
    const onFocusOut = () => setTimeout(measure, 100);
    (vv ?? window).addEventListener('resize', measure);
    window.addEventListener('focusin', measure);
    window.addEventListener('focusout', onFocusOut);
    measure();
    return () => {
      disposed = true;
      pluginHandles?.forEach(x => x.remove());
      (vv ?? window).removeEventListener('resize', measure);
      window.removeEventListener('focusin', measure);
      window.removeEventListener('focusout', onFocusOut);
      set(false);
    };
  }, []);

  // ── botão Voltar do Android ─────────────────────────────────────────────────
  // Lê a localização actual por ref: o listener nativo é registado uma só vez.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    let lastBack = 0;
    let busy = false;
    const onBack = async () => {
      if (busy) return;
      busy = true;
      try {
        if (await closeTopOverlay()) return;

        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) { navigate(-1); return; }

        const path = pathRef.current;
        const home = path.startsWith('/admin') ? '/admin' : '/';
        if (path.replace(/\/$/, '') !== home.replace(/\/$/, '') && path !== home) {
          navigate(home, { replace: true });
          return;
        }

        const now = Date.now();
        if (now - lastBack < EXIT_WINDOW_MS) exitApp();
        else { lastBack = now; showToast('Prima Voltar novamente para sair', 'info', EXIT_WINDOW_MS); }
      } finally {
        busy = false;
      }
    };

    let handle: { remove: () => unknown } | null = null;
    let disposed = false;
    onAndroidBack(onBack).then(h => { if (disposed) h?.remove(); else handle = h; });
    return () => { disposed = true; handle?.remove(); };
  }, [navigate, showToast]);

  return null;
};
