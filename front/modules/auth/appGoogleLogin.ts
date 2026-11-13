import { authService } from './services/authService';
import { isClientUser } from '../core/hooks/useUserPermissions';
import { closeSystemBrowser, openInSystemBrowser } from '../core/mobile/native';

/**
 * Login Google na app Android.
 *
 * O Google bloqueia o login dentro da WebView, por isso abrimos /entrar-google no browser do sistema
 * com um "nonce" aleatório. Enquanto o utilizador entra, a app pergunta ao servidor (polling) se a
 * sessão para esse nonce já existe — assim o login conclui na app mesmo que o Android abra o link
 * de regresso no browser em vez de na app.
 */
const POLL_MS = 2000;
const TIMEOUT_MS = 5 * 60 * 1000;
let activeTimer: number | null = null;

const randomNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

export async function startAppGoogleLogin(): Promise<boolean> {
  if (activeTimer) window.clearInterval(activeTimer);
  const nonce = randomNonce();
  const opened = await openInSystemBrowser(`${window.location.origin}/entrar-google?n=${nonce}`);
  if (!opened) return false;

  const startedAt = Date.now();
  let busy = false;
  const stop = () => { if (activeTimer) window.clearInterval(activeTimer); activeTimer = null; };

  activeTimer = window.setInterval(async () => {
    if (Date.now() - startedAt > TIMEOUT_MS) { stop(); return; }
    if (busy) return;
    busy = true;
    try {
      const { user } = await authService.pollAppHandoff(nonce);
      if (user) {
        stop();
        closeSystemBrowser();
        // Recarregar para o App ler a sessão nova: clientes ficam onde estavam, equipa vai para o painel
        window.location.replace(isClientUser(user) ? window.location.pathname + window.location.search : '/admin');
      }
    } finally {
      busy = false;
    }
  }, POLL_MS);
  return true;
}

/**
 * Link que devolve o utilizador à app depois do login no browser.
 * No Android usa um intent explícito para o pacote da app — um link https normal para o mesmo site
 * fica no browser (o Chrome não passa navegações do próprio site para a app).
 */
export function appReturnLink(code: string): string {
  const path = `/app-login?code=${encodeURIComponent(code)}`;
  if (/Android/i.test(navigator.userAgent)) {
    return `intent://${window.location.host}${path}#Intent;scheme=https;package=mz.co.naturerva.app;end`;
  }
  return `${window.location.origin}${path}`;
}
