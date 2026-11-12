import type React from 'react';

/**
 * Torna um elemento clicável não-nativo (div/tr com onClick) ativável pelo teclado:
 * Enter ou Espaço disparam o mesmo onClick. Ignora teclas vindas de elementos filhos
 * (inputs, botões) para não interferir com eles.
 */
export const activateOnKey = (e: React.KeyboardEvent<HTMLElement>) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
};
