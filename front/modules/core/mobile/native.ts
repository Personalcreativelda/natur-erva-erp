/**
 * Ponte mínima para a app Android (Capacitor).
 *
 * A app é uma WebView que carrega o site de produção (mobile/capacitor.config.json → server.url).
 * O Capacitor injecta `window.Capacitor` nessa página, por isso usamos os plugins nativos
 * directamente pelo objecto global — sem dependências npm no site e sem acoplar versões.
 *
 * Tudo aqui é seguro no browser normal: se não houver Capacitor ou o plugin não estiver
 * instalado no APK do utilizador (versão antiga), as funções simplesmente não fazem nada.
 */

type ListenerHandle = { remove: () => Promise<void> | void };

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
  Plugins?: Record<string, any>;
}

const cap = (): CapacitorGlobal | undefined =>
  typeof window !== 'undefined' ? (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor : undefined;

/** Corre dentro da app Android (Capacitor) — não no browser. */
export const isNativeApp = (): boolean => {
  const c = cap();
  if (c?.isNativePlatform?.()) return true;
  // Fallback: a app acrescenta este identificador ao user agent (capacitor.config.json → appendUserAgent)
  return typeof navigator !== 'undefined' && /NaturErvaApp\//.test(navigator.userAgent);
};

const plugin = (name: string): any | null => {
  const c = cap();
  if (!c?.isNativePlatform?.() || !c.isPluginAvailable?.(name)) return null;
  return c.Plugins?.[name] ?? null;
};

/** Regista o botão Voltar do Android. Devolve `null` se o APK ainda não tiver o plugin App. */
export const onAndroidBack = async (handler: () => void): Promise<ListenerHandle | null> => {
  const App = plugin('App');
  if (!App) return null;
  return App.addListener('backButton', handler);
};

/** Links https://www.natur-erva.co.mz/... abertos noutra app (WhatsApp, email) com a app já aberta. */
export const onAppUrlOpen = async (handler: (url: string) => void): Promise<ListenerHandle | null> => {
  const App = plugin('App');
  if (!App) return null;
  return App.addListener('appUrlOpen', (e: { url: string }) => handler(e.url));
};

/** Link que arrancou a app (arranque a frio a partir de um link). */
export const getLaunchUrl = async (): Promise<string | null> => {
  try {
    return (await plugin('App')?.getLaunchUrl?.())?.url ?? null;
  } catch {
    return null;
  }
};

export const exitApp = (): void => {
  plugin('App')?.exitApp?.();
};

/** Eventos do teclado virtual (plugin Keyboard). `null` se indisponível — usa-se a detecção por resize. */
export const onKeyboardChange = async (cb: (open: boolean) => void): Promise<ListenerHandle[] | null> => {
  const Keyboard = plugin('Keyboard');
  if (!Keyboard) return null;
  return Promise.all([
    Keyboard.addListener('keyboardWillShow', () => cb(true)),
    Keyboard.addListener('keyboardWillHide', () => cb(false)),
  ]);
};

/** Ícones da barra de estado/navegação legíveis sobre o tema do site (SystemBars é nativo do Capacitor 8). */
export const setSystemBarsDark = (darkUi: boolean): void => {
  try {
    // 'DARK' = barras escuras com ícones claros; 'LIGHT' = barras claras com ícones escuros
    plugin('SystemBars')?.setStyle?.({ style: darkUi ? 'DARK' : 'LIGHT' });
  } catch {
    /* ignorar */
  }
};

/** Vibração curta de confirmação (toques na barra inferior, adicionar ao carrinho). */
export const haptic = (style: 'LIGHT' | 'MEDIUM' = 'LIGHT'): void => {
  try {
    plugin('Haptics')?.impact?.({ style });
  } catch {
    /* sem haptics — ignorar */
  }
};
