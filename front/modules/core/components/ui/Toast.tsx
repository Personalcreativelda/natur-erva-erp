import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
 id: string;
 message: string;
 type: ToastType;
 duration?: number;
}

interface ToastProps {
 toast: Toast;
 onClose: (id: string) => void;
}

/** Aparência única de todas as notificações da aplicação */
const TOAST_STYLE: Record<ToastType, { title: string; icon: React.ElementType; chip: string; bar: string }> = {
 success: { title: 'Sucesso', icon: CheckCircle2, chip: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', bar: 'bg-green-500' },
 error: { title: 'Erro', icon: XCircle, chip: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', bar: 'bg-red-500' },
 warning: { title: 'Atenção', icon: AlertTriangle, chip: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', bar: 'bg-amber-500' },
 info: { title: 'Informação', icon: Info, chip: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', bar: 'bg-blue-500' },
};

export const ToastComponent: React.FC<ToastProps> = ({ toast, onClose }) => {
 // Erros ficam mais tempo no ecrã (são os que exigem leitura)
 const duration = toast.duration || (toast.type === 'error' ? 7000 : 4500);
 const [paused, setPaused] = useState(false);
 const remainingRef = useRef(duration);
 const startRef = useRef(Date.now());
 const style = TOAST_STYLE[toast.type] || TOAST_STYLE.info;
 const Icon = style.icon;

 // Temporizador que pausa com o rato por cima / foco (para dar tempo de ler)
 useEffect(() => {
  if (paused) return;
  startRef.current = Date.now();
  const t = setTimeout(() => onClose(toast.id), remainingRef.current);
  return () => {
   clearTimeout(t);
   remainingRef.current -= Date.now() - startRef.current;
  };
 }, [paused, toast.id, onClose]);

 return (
  <div
   role={toast.type === 'error' ? 'alert' : 'status'}
   aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
   onMouseEnter={() => setPaused(true)}
   onMouseLeave={() => setPaused(false)}
   className="toast-enter relative w-full md:w-[360px] overflow-hidden rounded-2xl border border-border-default bg-surface-raised text-content-primary shadow-xl"
  >
   <div className="flex items-start gap-3 p-3.5 pr-2">
    <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${style.chip}`}>
     <Icon className="w-5 h-5" />
    </span>
    <div className="flex-1 min-w-0 pt-0.5">
     <p className="text-sm font-semibold leading-5">{style.title}</p>
     <p className="text-sm text-content-secondary leading-5 mt-0.5 break-words">{toast.message}</p>
    </div>
    <button
     onClick={() => onClose(toast.id)}
     className="tap-target shrink-0 w-8 h-8 !min-h-0 flex items-center justify-center rounded-lg text-content-muted hover:text-content-primary hover:bg-surface-base transition-colors"
     aria-label="Fechar notificação"
    >
     <X className="w-4 h-4" />
    </button>
   </div>
   {/* Tempo restante */}
   <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-transparent">
    <div
     className={`h-full ${style.bar} toast-progress`}
     style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
    />
   </div>
  </div>
 );
};

interface ToastContainerProps {
 toasts: Toast[];
 onClose: (id: string) => void;
}

const MAX_VISIBLE = 3;

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
 if (toasts.length === 0) return null;
 const visible = toasts.slice(-MAX_VISIBLE);

 return (
  // Mobile: topo (abaixo do cabeçalho, longe da barra inferior). Desktop: canto inferior direito
  <div className="toast-stack fixed left-3 right-3 md:left-auto md:right-5 md:bottom-5 z-[10050] flex flex-col gap-2 pointer-events-none md:items-end">
   {visible.map(toast => (
    <div key={toast.id} className="pointer-events-auto w-full md:w-auto">
     <ToastComponent toast={toast} onClose={onClose} />
    </div>
   ))}
  </div>
 );
};
