import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Animação de entrada de página, ao estilo das apps nativas: avançar desliza da direita,
 * voltar desliza da esquerda. A animação só existe no CSS para ecrãs < 768px e sem
 * "reduzir movimento" — no desktop este wrapper é um <div> neutro.
 *
 * `variant="fade"` (sem deslocamento) para áreas com elementos `position: fixed` dentro da
 * página (ex.: POS), que um `transform` no contentor deslocaria durante a animação.
 */

// Ao nível do módulo (não do componente): o layout pode ser remontado ao mudar de rota,
// mas só a primeira página depois de abrir a app/site é que não deve animar.
let appStarted = false;

export const RouteTransition: React.FC<{ children: React.ReactNode; variant?: 'slide' | 'fade' }> = ({ children, variant = 'slide' }) => {
  const { pathname, key } = useLocation();
  const navType = useNavigationType();

  // Uma vez por entrada do histórico: re-renders do pai não reiniciam a animação
  const dir = useMemo(
    () => (!appStarted ? 'none' : navType === 'POP' ? 'back' : 'forward'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  useEffect(() => { appStarted = true; }, []);

  return (
    <div key={pathname} className={`route-enter route-enter-${variant}`} data-dir={dir}>
      {children}
    </div>
  );
};
