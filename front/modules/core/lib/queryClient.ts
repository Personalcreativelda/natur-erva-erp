import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * Cache de dados da aplicação (stale-while-revalidate):
 * - mostra logo o que está em cache (mesmo depois de recarregar a página);
 * - volta a pedir ao servidor em segundo plano ao montar / ao voltar ao separador
 *   e actualiza o ecrã sem esqueletos nem saltos.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,            // 1 min: dentro deste tempo não volta a pedir
      gcTime: 24 * 60 * 60_000,     // mantém em memória/persistência até 24h
      refetchOnWindowFocus: true,   // ao voltar ao separador traz dados frescos
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

/** Só as queries com `meta: { persist: true }` vão para o localStorage (dados públicos da loja) */
export const queryPersister = typeof window !== 'undefined'
  ? createSyncStoragePersister({ storage: window.localStorage, key: 'ne_query_cache', throttleTime: 1000 })
  : undefined;

/** A cache persistida é descartada a cada novo deploy (nunca mostra dados de uma versão antiga) */
export const QUERY_CACHE_BUSTER = typeof __APP_VERSION__ !== 'undefined' ? String(__APP_VERSION__) : 'dev';

/** Chaves partilhadas — invalidar com queryClient.invalidateQueries({ queryKey: queryKeys.shop.all }) */
export const queryKeys = {
  shop: {
    all: ['shop'] as const,
    products: ['shop', 'products'] as const,
    categories: ['shop', 'categories'] as const,
    blog: ['shop', 'blog'] as const,
    settings: ['shop', 'settings'] as const,
    tiles: ['shop', 'tiles'] as const,
  },
};
