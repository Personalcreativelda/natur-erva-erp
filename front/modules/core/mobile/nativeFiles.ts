/**
 * Ficheiros e impressão dentro da app Android.
 *
 * A WebView do Android não suporta:
 *  - transferências de ficheiros gerados no browser (<a download href="blob:…">) — usadas por
 *    todas as exportações PDF (jsPDF) e Excel (ExcelJS/xlsx);
 *  - pop-ups e window.print() — usados por recibos, faturas, etiquetas e cotações
 *    (window.open('') + document.write + print()).
 *
 * Em vez de alterar cada exportação/impressão, interceptamos estes dois padrões só na app:
 *  - transferência → guarda em Documentos/NaturErva (plugin Filesystem) e abre a folha de partilha
 *    (plugin Share) para abrir, enviar por WhatsApp/email, guardar no Drive ou imprimir;
 *  - impressão → o HTML vai para o plugin nativo NaturPrint (diálogo do Android, com "Guardar como PDF").
 *
 * No browser e em APKs sem estes plugins nada é instalado — tudo continua como antes.
 */
import { isNativeApp } from './native';

type Notify = (message: string, type?: 'success' | 'error' | 'info') => void;

const plugins = (): Record<string, any> | null => {
  const cap = (window as any).Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins ?? null : null;
};
const has = (name: string) => !!(window as any).Capacitor?.isPluginAvailable?.(name);

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

const safeName = (name: string) => (name || 'documento').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'documento';

/** Guarda um ficheiro gerado no browser e abre a folha de partilha do Android. */
export const saveFileNative = async (blob: Blob, filename: string, notify?: Notify): Promise<void> => {
  const P = plugins();
  if (!P?.Filesystem) return;
  const name = safeName(filename);
  const data = await blobToBase64(blob);

  let uri: string;
  let savedInDocuments = true;
  try {
    // Pasta pública Documentos/NaturErva — o ficheiro fica no telemóvel
    uri = (await P.Filesystem.writeFile({ path: `NaturErva/${name}`, data, directory: 'DOCUMENTS', recursive: true })).uri;
  } catch {
    // Sem acesso à pasta pública (permissão recusada em Android antigo): cache da app
    savedInDocuments = false;
    uri = (await P.Filesystem.writeFile({ path: name, data, directory: 'CACHE' })).uri;
  }

  if (savedInDocuments) notify?.(`${name} guardado em Documentos/NaturErva`, 'success');

  if (P.Share) {
    try {
      await P.Share.share({ title: name, files: [uri], dialogTitle: 'Abrir ou partilhar' });
    } catch {
      /* utilizador fechou a folha de partilha */
    }
  }
};

/** Imprime HTML com o diálogo nativo do Android (permite "Guardar como PDF"). */
export const printHtmlNative = (html: string): void => {
  const P = plugins();
  if (!P?.NaturPrint) return;
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || 'Natur Erva';
  P.NaturPrint.printHtml({ html, name: title, baseUrl: window.location.origin + '/' });
};

/** Janela "falsa" devolvida por window.open('') na app: recolhe o HTML e imprime-o nativamente. */
const createPrintWindow = (): Window => {
  let html = '';
  let sent = false;
  const send = () => {
    if (sent || !html.trim()) return;
    sent = true;
    printHtmlNative(html);
  };
  const doc = {
    write: (...parts: string[]) => { html += parts.join(''); },
    writeln: (...parts: string[]) => { html += parts.join('') + '\n'; },
    open: () => { html = ''; sent = false; return doc; },
    // document.close() marca o fim do conteúdo; adiar um tick deixa o código chamar print() primeiro
    close: () => { setTimeout(send, 0); },
    title: '',
  };
  const fake = {
    document: doc,
    print: send,
    focus: () => {},
    blur: () => {},
    close: () => {},
    closed: false,
    onload: null,
    onafterprint: null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return fake as unknown as Window;
};

let installed = false;

/** Instala as intercepções (uma vez). Só tem efeito dentro da app com os plugins necessários. */
export const installNativeFileBridge = (notify?: Notify): void => {
  if (installed || !isNativeApp()) return;
  installed = true;

  // ── transferências blob:/data: ───────────────────────────────────────────
  if (has('Filesystem')) {
    // O código revoga o URL logo após o click; a leitura é assíncrona → adiar a revogação
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => { setTimeout(() => revoke(url), 60_000); };

    const handle = (a: HTMLAnchorElement): boolean => {
      if (!a.hasAttribute('download') || !/^(blob:|data:)/.test(a.href)) return false;
      const name = a.getAttribute('download') || 'documento';
      fetch(a.href)
        .then(r => r.blob())
        .then(blob => saveFileNative(blob, name, notify))
        .catch(() => notify?.('Não foi possível guardar o ficheiro', 'error'));
      return true;
    };

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (!handle(this)) origClick.call(this);
    };
    // jsPDF/FileSaver disparam um MouseEvent num <a> fora do documento
    const origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function (this: HTMLAnchorElement, ev: Event) {
      if (ev.type === 'click' && handle(this)) return false;
      return origDispatch.call(this, ev);
    };
    // Links <a download> reais na página
    document.addEventListener('click', e => {
      const a = (e.target as Element | null)?.closest?.('a[download]') as HTMLAnchorElement | null;
      if (a && handle(a)) e.preventDefault();
    }, true);
  }

  // ── impressão via pop-up ─────────────────────────────────────────────────
  if (has('NaturPrint')) {
    const origOpen = window.open.bind(window);
    window.open = ((url?: string | URL, target?: string, features?: string) => {
      const u = url == null ? '' : String(url);
      if (u === '' || u === 'about:blank') return createPrintWindow();
      return origOpen(url as string, target, features);
    }) as typeof window.open;
    // window.print() na própria página (raro) → imprime a página actual
    window.print = () => printHtmlNative(document.documentElement.outerHTML);
  }
};
