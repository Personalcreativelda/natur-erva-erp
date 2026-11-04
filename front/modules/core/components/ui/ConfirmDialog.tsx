import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Info, Trash2 } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'default';

const VARIANTS: Record<ConfirmVariant, { chip: string; button: string; icon: React.ElementType; title: string }> = {
 danger: { chip: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400', button: 'bg-red-600 hover:bg-red-700 active:bg-red-800', icon: Trash2, title: 'Tem a certeza?' },
 warning: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', button: 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800', icon: AlertTriangle, title: 'Atenção' },
 info: { chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', button: 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800', icon: Info, title: 'Confirmar' },
 default: { chip: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300', button: 'bg-brand-600 hover:bg-brand-700 active:bg-brand-800', icon: HelpCircle, title: 'Confirmar' },
};

export interface ConfirmDialogViewProps {
 title?: string;
 message: React.ReactNode;
 confirmText?: string;
 cancelText?: string;
 variant?: ConfirmVariant;
 onConfirm: () => void;
 onCancel: () => void;
}

/**
 * Aparência ÚNICA de todas as confirmações da aplicação.
 * Usada pelo <ConfirmDialog> (com estado na página) e pelo confirm() do ConfirmContext.
 */
export const ConfirmDialogView: React.FC<ConfirmDialogViewProps> = ({
 title,
 message,
 confirmText = 'Confirmar',
 cancelText = 'Cancelar',
 variant = 'default',
 onConfirm,
 onCancel,
}) => {
 const v = VARIANTS[variant] || VARIANTS.default;
 const Icon = v.icon;

 // Esc cancela, Enter confirma; bloqueia o scroll da página por trás
 useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
   if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
   if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
  };
  document.addEventListener('keydown', onKey);
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
 }, [onCancel, onConfirm]);

 if (typeof document === 'undefined') return null;

 return createPortal(
  <div
   className="fixed inset-0 z-[10040] flex items-end sm:items-center justify-center p-3 sm:p-4 modal-overlay"
   onClick={onCancel}
   role="alertdialog"
   aria-modal="true"
   aria-labelledby="confirm-dialog-title"
   aria-describedby="confirm-dialog-message"
  >
   <div
    className="w-full max-w-[400px] rounded-3xl bg-surface-raised border border-border-default shadow-2xl animate-modal-enter"
    style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    onClick={e => e.stopPropagation()}
   >
    <div className="px-6 pt-6 pb-5 text-center sm:text-left sm:flex sm:items-start sm:gap-4">
     <span className={`mx-auto sm:mx-0 mb-3 sm:mb-0 shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${v.chip}`}>
      <Icon className="w-6 h-6" />
     </span>
     <div className="min-w-0 sm:pt-0.5">
      <h3 id="confirm-dialog-title" className="text-[17px] font-semibold text-content-primary leading-snug">
       {title || v.title}
      </h3>
      <div id="confirm-dialog-message" className="mt-1.5 text-sm text-content-secondary leading-relaxed whitespace-pre-line break-words">
       {message}
      </div>
     </div>
    </div>
    <div className="px-6 pb-6 grid grid-cols-2 gap-3">
     <button
      type="button"
      onClick={onCancel}
      className="h-11 rounded-xl border border-border-default text-sm font-semibold text-content-secondary hover:bg-surface-base transition-colors"
     >
      {cancelText}
     </button>
     <button
      type="button"
      onClick={onConfirm}
      autoFocus
      className={`h-11 rounded-xl text-sm font-semibold text-white transition-colors ${v.button}`}
     >
      {confirmText}
     </button>
    </div>
   </div>
  </div>,
  document.body
 );
};

interface ConfirmDialogProps {
 isOpen: boolean;
 title?: string;
 message: string;
 confirmText?: string;
 cancelText?: string;
 onConfirm: () => void;
 onCancel: () => void;
 variant?: 'danger' | 'warning' | 'info';
}

/** Versão controlada por estado (isOpen) — mesma aparência do confirm() do ConfirmContext */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ isOpen, variant = 'warning', ...rest }) => {
 if (!isOpen) return null;
 return <ConfirmDialogView variant={variant} {...rest} />;
};
