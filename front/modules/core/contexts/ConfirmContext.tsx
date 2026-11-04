import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { ConfirmDialogView, ConfirmVariant } from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' = vermelho (ações destrutivas); 'warning' = âmbar; 'default' = cor da marca. */
  variant?: ConfirmVariant;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

export const ConfirmProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const closingRef = useRef(false);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>(resolve => {
      setPending({ message, options, resolve });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setPending(current => {
      current?.resolve(value);
      return null;
    });
    setTimeout(() => { closingRef.current = false; }, 0);
  }, []);

  const onConfirm = useCallback(() => settle(true), [settle]);
  const onCancel = useCallback(() => settle(false), [settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialogView
          title={pending.options.title}
          message={pending.message}
          confirmText={pending.options.confirmLabel}
          cancelText={pending.options.cancelLabel}
          variant={pending.options.variant || 'default'}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}
    </ConfirmContext.Provider>
  );
};

/** Substitui o window.confirm() nativo do browser por um diálogo com o estilo da aplicação. Uso: `if (!(await confirm('Mensagem?'))) return;` */
export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
};
