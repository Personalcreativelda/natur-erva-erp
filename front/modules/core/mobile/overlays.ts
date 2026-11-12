/**
 * Fecha o diálogo/painel que estiver por cima — usado pelo botão Voltar do Android.
 *
 * A aplicação tem dezenas de modais construídos à mão (div fixed inset-0), sem um componente
 * comum. Em vez de alterar cada um, procura-se a camada fixa de ecrã inteiro mais acima e
 * fecha-se como um utilizador faria: botão "Fechar" → tecla Escape → toque no fundo.
 * Cada passo é verificado; se nada a fechar, devolve false e o Voltar navega normalmente.
 */

const CLOSE_LABEL = /^(fechar|close|cancelar|voltar)$/i;
const IGNORE = '[data-back-ignore], #lfw-btn, #lfw-window, .pos-mobile-viewport';

const isShown = (el: Element): boolean => {
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  // opacity 0 só conta como escondido se também não recebe toques — um modal a meio da
  // animação de entrada (opacity a subir de 0) tem de ser fechado pelo Voltar.
  if (parseFloat(s.opacity) === 0 && s.pointerEvents === 'none') return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

/** Camada fixa que cobre (quase) o ecrã inteiro e está mais acima (z-index, depois ordem no DOM). */
export const findTopOverlay = (): HTMLElement | null => {
  const vw = window.innerWidth, vh = window.innerHeight;
  let best: HTMLElement | null = null;
  let bestZ = -Infinity;
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('div, aside, section, dialog'))) {
    if (el.closest(IGNORE)) continue;
    const s = getComputedStyle(el);
    if (s.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.6) continue;
    if (!isShown(el)) continue;
    const z = parseInt(s.zIndex, 10) || 0;
    if (z >= bestZ) { best = el; bestZ = z; } // ">=" → o último no DOM ganha em empate
  }
  return best;
};

const nextFrame = () => new Promise<void>(r => setTimeout(r, 60));
const stillOpen = (el: HTMLElement) => el.isConnected && isShown(el);

const findCloseButton = (root: HTMLElement): HTMLElement | null => {
  for (const b of Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'))) {
    const label = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
    if (CLOSE_LABEL.test(label) && isShown(b) && !(b as HTMLButtonElement).disabled) return b;
  }
  return null;
};

const findBackdrop = (root: HTMLElement): HTMLElement => {
  // Padrão comum: <div fixed inset-0><div absolute inset-0 onClick={fechar} /> …conteúdo… </div>
  const child = Array.from(root.children).find(c => {
    const s = getComputedStyle(c);
    const r = c.getBoundingClientRect();
    return s.position === 'absolute' && r.width >= root.clientWidth * 0.9 && r.height >= root.clientHeight * 0.9;
  });
  return (child as HTMLElement) || root;
};

export const closeTopOverlay = async (): Promise<boolean> => {
  const el = findTopOverlay();
  if (!el) return false;

  const btn = findCloseButton(el);
  if (btn) { btn.click(); await nextFrame(); if (!stillOpen(el)) return true; }

  for (const target of [document, window] as const) {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  }
  await nextFrame();
  if (!stillOpen(el)) return true;

  findBackdrop(el).click();
  await nextFrame();
  return !stillOpen(el);
};
