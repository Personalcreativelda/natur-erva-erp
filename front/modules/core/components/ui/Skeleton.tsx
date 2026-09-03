import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface SkeletonProps {
  type?: 'card' | 'text' | 'avatar' | 'stats' | 'table';
  count?: number;
  rows?: number;
}

/** Placeholder animado reutilizável para estados de carregamento — nunca mostrar dados inventados enquanto se espera pela BD. */
export const Skeleton: React.FC<SkeletonProps> = ({ type = 'card', count = 1, rows = 5 }) => {
  if (type === 'stats') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {Array.from({ length: count || 4 }).map((_, i) => (
          <div key={i} className="bg-surface-raised rounded-2xl shadow-lg p-6 animate-pulse">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-surface-base rounded-xl"></div>
            </div>
            <div className="h-4 bg-surface-base rounded w-2/3 mb-2"></div>
            <div className="h-8 bg-surface-base rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'avatar') {
    return (
      <div className="animate-pulse">
        <div className="w-16 h-16 bg-surface-base rounded-full"></div>
      </div>
    );
  }

  if (type === 'table') {
    return (
      <div className="bg-surface-raised rounded-xl border border-border-default overflow-hidden animate-pulse">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border-default last:border-0">
            <div className="w-8 h-8 bg-surface-base rounded-full shrink-0" />
            <div className="h-3 bg-surface-base rounded flex-1" />
            <div className="h-3 bg-surface-base rounded w-20 shrink-0" />
            <div className="h-3 bg-surface-base rounded w-16 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'text') {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="h-4 bg-surface-base rounded" style={{ width: `${Math.random() * 40 + 60}%` }}></div>
        ))}
      </div>
    );
  }

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-surface-raised rounded-xl shadow p-6 animate-pulse">
          <div className="h-4 bg-surface-base rounded w-3/4 mb-4"></div>
          <div className="h-8 bg-surface-base rounded w-1/2"></div>
        </div>
      ))}
    </>
  );
};

/** Esqueleto de uma página inteira (dashboard-like) — usado enquanto os dados iniciais ainda não chegaram. */
export const PageSkeleton: React.FC = () => (
  <div className="p-4 md:p-8 space-y-6">
    <div className="h-8 bg-surface-raised rounded w-48 animate-pulse" />
    <Skeleton type="stats" count={4} />
    <Skeleton type="table" rows={6} />
  </div>
);

/** Estado de erro de ligação — mostrar em vez de avançar com dados vazios como se a base de dados não tivesse nada. */
export const ConnectionErrorState: React.FC<{ onRetry?: () => void; message?: string }> = ({
  onRetry,
  message = 'Não foi possível ligar ao servidor. Verifica a tua ligação e tenta novamente.',
}) => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-6">
    <div className="w-16 h-16 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
      <WifiOff className="w-7 h-7 text-red-500" />
    </div>
    <div>
      <h2 className="text-lg font-semibold text-content-primary">Sem ligação</h2>
      <p className="text-sm text-content-muted mt-1 max-w-sm">{message}</p>
    </div>
    {onRetry && (
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> Tentar novamente
      </button>
    )}
  </div>
);
