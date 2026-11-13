import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { authService } from '../services/authService';
import { isClientUser } from '../../core/hooks/useUserPermissions';
import { closeSystemBrowser } from '../../core/mobile/native';

/**
 * /app-login?code=… — destino do login Google feito no browser do sistema.
 * Na app chega pelo link verificado (deep link); troca o código de uso único pela sessão e
 * recarrega para a área certa: clientes ficam na loja, equipa vai para o painel.
 */
export const AppLoginCallback: React.FC = () => {
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = params.get('code');
    if (!code) { setError('Link de login inválido.'); return; }
    let cancelled = false;
    authService.redeemAppHandoffCode(code).then(({ user, error: redeemError }) => {
      if (cancelled) return;
      if (!user) { setError(redeemError || 'Não foi possível concluir o login.'); return; }
      closeSystemBrowser();
      // Recarregar: a verificação de sessão do App lê o token novo
      window.location.replace(isClientUser(user) ? '/' : '/admin');
    });
    return () => { cancelled = true; };
  }, [params]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4" role="status">
      {error ? (
        <div className="max-w-sm text-center">
          <p className="text-content-primary font-semibold">{error}</p>
          <a href="/" className="inline-block mt-4 text-green-600 font-semibold">Voltar à loja</a>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-content-muted">
          <Loader2 className="w-5 h-5 animate-spin" /> A iniciar sessão…
        </div>
      )}
    </div>
  );
};

export default AppLoginCallback;
