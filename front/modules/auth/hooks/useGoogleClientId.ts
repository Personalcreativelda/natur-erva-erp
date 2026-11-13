import { useEffect, useState } from 'react';
import api from '../../core/services/apiClient';

/**
 * Client ID do Google para o botão "Continuar com Google".
 * Vem do backend (GET /api/auth/google-config — o mesmo ID que valida o login), com
 * VITE_GOOGLE_CLIENT_ID como alternativa. Assim o botão não depende de variáveis no Vercel.
 * `undefined` = ainda a carregar; `null` = Google não configurado.
 */
let cached: string | null | undefined;
let pending: Promise<string | null> | null = null;

/** Só IDs reais do Google — valores de exemplo ("your_google_client_id_here") contam como não configurado. */
const isRealClientId = (id?: string | null): id is string => !!id && /\.apps\.googleusercontent\.com$/.test(id.trim());

const load = (): Promise<string | null> => {
  const fromBuild = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  if (isRealClientId(fromBuild)) return Promise.resolve(fromBuild.trim());
  if (!pending) {
    pending = api.get<{ clientId: string | null }>('/auth/google-config')
      .then(r => (isRealClientId(r?.clientId) ? r!.clientId!.trim() : null))
      .catch(() => null);
  }
  return pending;
};

export const useGoogleClientId = (): string | null | undefined => {
  const [id, setId] = useState<string | null | undefined>(cached);
  useEffect(() => {
    if (cached !== undefined) return;
    let alive = true;
    load().then(v => { cached = v; if (alive) setId(v); });
    return () => { alive = false; };
  }, []);
  return id;
};
