import { useEffect, useState } from 'react';
import { APP_REFRESH_EVENT } from '../mobile/pullToRefresh';

/**
 * Número que muda a cada "puxar para actualizar". Usado como `key` à volta do conteúdo da página
 * nos layouts: a página volta a montar e a pedir os dados, mas cabeçalho e menus ficam no lugar.
 */
export function useRefreshKey(): number {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const bump = () => setKey(k => k + 1);
    window.addEventListener(APP_REFRESH_EVENT, bump);
    return () => window.removeEventListener(APP_REFRESH_EVENT, bump);
  }, []);
  return key;
}
