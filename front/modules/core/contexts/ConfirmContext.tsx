import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' usa vermelho (ações destrutivas); 'default' usa a cor da marca. */
  variant?: 'danger' | 'default';
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

  const settle = (value: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    pending?.resolve(value);
    setPending(null);
    setTimeout(() => { closingRef.current = false; }, 0);
  };

  const isDanger = pending?.options.variant === 'danger';

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center modal-overlay p-4"
          onClick={() => settle(false)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="bg-surface-raised rounded-2xl shadow-xl w-full max-w-sm animate-modal-enter"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                  : 'bg-brand-100 dark:bg-brand-900/30 text-brand-600'
              }`}>
                {isDanger ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
              </div>
              <div className="min-w-0 pt-1">
                {pending.options.title && (
                  <h3 className="font-semibold text-content-primary mb-1">{pending.options.title}</h3>
                )}
                <p className="text-sm text-content-secondary whitespace-pre-line">{pending.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-6">
              <button
                onClick={() => settle(false)}
                className="px-4 py-2 text-sm border border-border-default rounded-lg text-content-secondary hover:bg-surface-overlay transition-colors"
              >
                {pending.options.cancelLabel || 'Cancelar'}
              </button>
              <button
                onClick={() => settle(true)}
                autoFocus
                className={`px-4 py-2 text-sm text-white rounded-lg font-medium transition-colors ${
                  isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {pending.options.confirmLabel || 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
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
