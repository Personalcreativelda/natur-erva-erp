import React, { useState } from 'react';
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google';
import { useGoogleClientId } from '../hooks/useGoogleClientId';
import { CheckCircle2, Loader2, Smartphone } from 'lucide-react';
import { authService } from '../services/authService';
import { appReturnLink } from '../appGoogleLogin';

/**
 * /entrar-google — aberta pela app Android no browser do sistema (o Google bloqueia o login
 * dentro de WebViews). O utilizador entra com Google aqui; depois devolvemos a sessão à app
 * com um código de uso único, pelo link verificado https://www.natur-erva.co.mz/app-login.
 */
export const AppGoogleLogin: React.FC = () => {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');
  const [returnLink, setReturnLink] = useState('');
  const googleClientId = useGoogleClientId();

  const finish = async () => {
    // n = nonce da app: permite que a app conclua o login por polling, mesmo sem o link de regresso
    const nonce = new URLSearchParams(window.location.search).get('n');
    const { code, error: handoffError } = await authService.requestAppHandoffCode(nonce);
    if (!code) { setError(handoffError || 'Não foi possível concluir o login.'); setState('error'); return; }
    const link = appReturnLink(code);
    setReturnLink(link);
    setState('done');
    // Tenta voltar à app automaticamente; o botão abaixo fica como alternativa garantida
    window.location.href = link;
  };

  const onGoogle = async (credential?: string) => {
    if (!credential) { setError('Erro ao autenticar com Google.'); setState('error'); return; }
    setState('working'); setError('');
    const { user, error: loginError } = await authService.signInWithGoogleCredential(credential);
    if (!user) { setError(loginError || 'Erro ao autenticar com Google.'); setState('error'); return; }
    await finish();
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-surface-raised border border-border-default rounded-3xl p-6 text-center shadow-sm">
        {state === 'done' ? (
          <>
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-content-primary">Sessão iniciada</h1>
            <p className="text-sm text-content-muted mt-1 mb-5">A app Natur Erva já deve ter aberto. Se não abriu, toque no botão.</p>
            <a href={returnLink} className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold">
              <Smartphone className="w-5 h-5" /> Voltar à app
            </a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-content-primary">Entrar com Google</h1>
            <p className="text-sm text-content-muted mt-1 mb-6">Depois de entrar voltamos automaticamente à app.</p>
            {googleClientId === undefined ? (
              <div className="flex justify-center min-h-[44px] items-center"><Loader2 className="w-5 h-5 animate-spin text-content-muted" /></div>
            ) : !googleClientId ? (
              <p className="text-sm text-red-600">O login com Google ainda não está configurado.</p>
            ) : state === 'working' ? (
              <div className="flex items-center justify-center gap-2 text-content-muted text-sm min-h-[44px]">
                <Loader2 className="w-4 h-4 animate-spin" /> A autenticar…
              </div>
            ) : (
              <div className="flex justify-center min-h-[44px]">
                <GoogleOAuthProvider clientId={googleClientId}>
                <GoogleLogin
                  onSuccess={r => onGoogle(r.credential)}
                  onError={() => { setError('Erro ao autenticar com Google.'); setState('error'); }}
                  text="continue_with" shape="pill" width="280"
                />
                </GoogleOAuthProvider>
              </div>
            )}
            {error && (
              <p className="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2.5" role="alert">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AppGoogleLogin;
