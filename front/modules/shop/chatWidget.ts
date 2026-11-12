/**
 * Chat LeadsFlow — só na loja.
 *
 * Antes era carregado no index.html para toda a aplicação e escondido no admin por CSS.
 * Agora só é carregado quando uma página da loja abre (PublicLayout): o painel de
 * administração nunca o descarrega. Se o utilizador passar da loja para o admin, o CSS
 * (index.html, html[data-area="admin"] [id^="lfw"]) esconde-o.
 */
let loaded = false;

export const loadShopChatWidget = (): void => {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;

  const w = window as any;
  // Snippet oficial da LeadsFlow (fila de comandos até o script carregar)
  w.LeadsFlowWidget = 'lfw';
  w.lfw = w.lfw || function (...args: unknown[]) { (w.lfw.q = w.lfw.q || []).push(args); };

  const js = document.createElement('script');
  js.id = 'lfw';
  js.src = 'https://api.leadsflowapi.com/w';
  js.async = true;
  document.head.appendChild(js);

  w.lfw('init', {
    channelId: '662d73c3-914d-4ae3-ab74-1ffebd518755',
    primaryColor: '#2edc50',
    welcomeMessage: 'Olá! Como posso ajudar?',
    position: 'bottom-right',
  });
};
