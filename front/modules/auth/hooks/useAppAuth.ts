import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { User, UserRole } from '../../core/types/types';
import { closeSystemBrowser } from '../../core/mobile/native';
const BASE_PATH = '/';

interface UseAppAuthReturn {
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  isAuthLoading: boolean;
  isShopMode: boolean;
  activePage: string;
  handleLogin: (user: User) => void;
  handleLogout: () => void;
  setActivePage: (page: string) => void;
  setIsShopMode: (mode: boolean) => void;
  /** true quando a verificação de sessão falhou por não conseguir contactar o servidor (não é "sem sessão"). */
  sessionCheckError: boolean;
}

export const useAppAuth = (): UseAppAuthReturn => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isShopMode, setIsShopMode] = useState(false);
  const [activePage, setActivePage] = useState('dashboard');
  const [sessionCheckError, setSessionCheckError] = useState(false);

  const handleLogin = useCallback((user: User) => {
    setCurrentUser(user);

    // Verificar se estamos em modo loja (via URL ou estado)
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.has('admin');
    const isShopModeParam = urlParams.has('shop') || !isAdminMode;

    // Redirecionar baseado no role do usuário E modo atual
    const isClientOnly = user.role === UserRole.CLIENTE ||
      (user.roles && user.roles.length === 1 && user.roles[0] === 'CLIENTE');

    if (import.meta.env.DEV) {
      console.log('🔍 handleLogin called:', {
        email: user.email,
        role: user.role,
        roles: user.roles,
        isClientOnly,
        isAdminMode,
        isShopModeParam
      });
    }

    // Se está em modo loja OU é cliente, permanecer na loja
    if (isShopModeParam || isClientOnly) {
      if (import.meta.env.DEV) console.log('✅ Permanece na loja');
      setIsShopMode(true);
      setActivePage('shop');

      // Remover parâmetro admin da URL se existir
      try {
        const newUrl = `${window.location.origin}${BASE_PATH}`;
        window.history.replaceState({}, '', newUrl);
        if (import.meta.env.DEV) console.log('📍 URL atualizada para loja:', newUrl);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('Could not update URL:', e);
      }
    } else if (isAdminMode) {
      // Admin/Staff em modo admin: ir para painel admin
      if (import.meta.env.DEV) console.log('✅ Admin/Staff em modo admin - redirecionando para painel');
      setIsShopMode(false);
      setActivePage('dashboard');
      // Atualizar URL para modo admin (usar replaceState para evitar adicionar ao histórico)
      try {
        const newUrl = `${window.location.origin}${BASE_PATH}?admin`;
        window.history.replaceState({}, '', newUrl);
        if (import.meta.env.DEV) console.log('📍 URL atualizada para admin:', newUrl);
      } catch (e) {
        // Fallback se replaceState falhar
        if (import.meta.env.DEV) console.warn('Could not update URL:', e);
      }
    } else {
      // Padrão: se é cliente vai para loja, senão para admin
      if (isClientOnly) {
        setIsShopMode(true);
        setActivePage('shop');
      } else {
        setIsShopMode(false);
        setActivePage('dashboard');
      }
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (import.meta.env.DEV) console.log('🚪 Iniciando logout...');

    setCurrentUser(null);
    setIsShopMode(true);
    setActivePage('shop');

    // 1. signOut no cliente (scope: 'local' = sem chamada ao servidor)
    authService.signOut();

    // 3. Redirecionar
    const newUrl = `${window.location.origin}${BASE_PATH}`;
    window.location.href = newUrl;
  }, []);

  // A verificação da sessão corre UMA vez, ao abrir a app. O `navigate` do React Router muda
  // de identidade a cada mudança de página; com ele nas dependências, o efeito voltava a correr
  // em navegações, punha isAuthLoading=true e a app inteira (painel incluído) era desmontada e
  // recarregada. Refs dão acesso às versões actuais sem reexecutar o efeito.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Check for active session on load
  useEffect(() => {
    const checkSession = async () => {
      setIsAuthLoading(true);

      // (O antigo callback OAuth do Supabase foi removido: o login Google usa /auth/google e
      // /app-login?code=… — esse "code" fazia esta verificação esperar 1,5 s à toa.)
      const urlParams = new URLSearchParams(window.location.search);
      const hash = window.location.hash;

      // Regresso do login Google na app (/app-login?code=…): troca o código pela sessão AQUI, durante
      // o ecrã de arranque — um só loading em vez de arranque + "A iniciar sessão…" + loja.
      const handoffCode = window.location.pathname === '/app-login' ? urlParams.get('code') : null;
      if (handoffCode) {
        const { user: redeemed } = await authService.redeemAppHandoffCode(handoffCode);
        // O código pode já ter sido usado pela própria app (polling): com sessão activa, segue em frente
        const handoffUser = redeemed || (localStorage.getItem('auth_token') ? await authService.getCurrentUser() : null);
        if (handoffUser) {
          const isClientOnly = handoffUser.role === UserRole.CLIENTE ||
            (handoffUser.roles && handoffUser.roles.length === 1 && handoffUser.roles[0] === 'CLIENTE');
          closeSystemBrowser();
          setIsShopMode(isClientOnly);
          setActivePage(isClientOnly ? 'shop' : 'dashboard');
          setCurrentUser(handoffUser);
          navigateRef.current(isClientOnly ? '/' : '/admin', { replace: true });
          setIsAuthLoading(false);
          return;
        }
        // Falhou: segue o fluxo normal e a página /app-login mostra o erro
      }

      // Verificar se está em modo admin (via hash ou query param)
      const adminMode = hash === '#admin' || urlParams.has('admin');

      // Verificar se há usuário logado primeiro
      const user = await authService.getCurrentUser();
      setSessionCheckError(!user && authService.getLastAuthCheckError() === 'network');

      if (user) {
        // Se há usuário logado, verificar se é cliente
        const isClientOnly = user.role === UserRole.CLIENTE ||
          (user.roles && user.roles.length === 1 && user.roles[0] === 'CLIENTE');

        // Verificar se há parâmetro shop na URL (força modo loja)
        const shopModeParam = urlParams.has('shop');

        if (isClientOnly) {
          // Cliente: sempre mostrar loja, mesmo se URL tiver ?admin
          if (import.meta.env.DEV) console.log('👤 Cliente logado - forçando modo loja');
          setIsShopMode(true);
          setCurrentUser(user);

          // Remover parâmetro admin se existir
          if (adminMode) {
            try {
              const newUrl = `${window.location.origin}${window.location.pathname}`;
              window.history.replaceState({}, '', newUrl);
            } catch (e) {
              if (import.meta.env.DEV) console.warn('Could not remove admin param:', e);
            }
          }
        } else if (shopModeParam || !adminMode) {
          // Admin/Staff em modo loja OU sem parâmetro admin: mostrar loja
          setIsShopMode(true);
          setActivePage('shop');
          setCurrentUser(user);

          // Remover parâmetro admin se existir
          if (adminMode) {
            try {
              const newUrl = `${window.location.origin}${window.location.pathname}`;
              window.history.replaceState({}, '', newUrl);
            } catch (e) {
              if (import.meta.env.DEV) console.warn('Could not remove admin param:', e);
            }
          }
        } else {
          // Admin/Staff em modo admin: ir para painel admin
          setIsShopMode(false);
          setActivePage('dashboard');
          setCurrentUser(user);

          // Garantir que URL tem parâmetro admin
          if (!adminMode) {
            try {
              const newUrl = `${window.location.origin}${window.location.pathname}?admin`;
              window.history.replaceState({}, '', newUrl);
            } catch (e) {
              if (import.meta.env.DEV) console.warn('Could not add admin param:', e);
            }
          }
        }
      } else {
        // Sem usuário logado: SEMPRE mostrar loja, independente do modo admin
        if (import.meta.env.DEV) console.log('👤 Nenhum usuário logado - forçando modo loja');
        setIsShopMode(true);
        setActivePage('shop');

        // Remover qualquer parâmetro admin da URL
        if (adminMode) {
          try {
            const newUrl = `${window.location.origin}${window.location.pathname}`;
            window.history.replaceState({}, '', newUrl);
            if (import.meta.env.DEV) console.log('✅ Parâmetro admin removido da URL após logout');
          } catch (e) {
            if (import.meta.env.DEV) console.warn('Could not remove admin param:', e);
          }
        }
      }

      setIsAuthLoading(false);
    };
    checkSession();
  }, []);

  // Login concluído fora do fluxo normal (app Android: deep link /app-login ou polling) — entra
  // directamente com o utilizador, sem recarregar a página e repetir todos os ecrãs de carregamento.
  useEffect(() => {
    const onExternalLogin = (event: Event) => {
      const { user, redirectTo } = ((event as CustomEvent).detail || {}) as { user?: User; redirectTo?: string };
      if (!user) return;
      const isClientOnly = user.role === UserRole.CLIENTE ||
        (user.roles && user.roles.length === 1 && user.roles[0] === 'CLIENTE');
      setSessionCheckError(false);
      setIsShopMode(isClientOnly || !redirectTo?.startsWith('/admin'));
      setActivePage(isClientOnly ? 'shop' : 'dashboard');
      setCurrentUser(user);
      if (redirectTo) navigateRef.current(redirectTo, { replace: true });
    };
    window.addEventListener('auth:login', onExternalLogin);
    return () => window.removeEventListener('auth:login', onExternalLogin);
  }, []);

  // Sessão infinita: não há timeout por inatividade nem logout periódico.
  // A sessão só termina com logout manual ou quando o Supabase invalidar (ex.: refresh token expirado no servidor).
  // O cliente Supabase já usa autoRefreshToken: true para renovar o JWT automaticamente.

  return {
    currentUser,
    setCurrentUser,
    isAuthLoading,
    isShopMode,
    activePage,
    handleLogin,
    handleLogout,
    setActivePage,
    setIsShopMode,
    sessionCheckError
  };
};
