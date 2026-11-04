import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Home, Search, Leaf } from 'lucide-react';

/** Página 404 da loja — antes, URLs inválidas mostravam uma página vazia */
export const NotFoundPage: React.FC = () => {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Página não encontrada · Natur Erva';
    return () => { document.title = prev; };
  }, []);

  return (
    <section className="min-h-[60vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 w-20 h-20 rounded-3xl bg-brand-600/10 flex items-center justify-center">
          <Leaf className="w-10 h-10 text-brand-600" />
        </div>
        <p className="text-sm font-semibold text-brand-600 mb-2">Erro 404</p>
        <h1 className="text-2xl md:text-3xl font-bold text-content-primary mb-3">Esta página não existe</h1>
        <p className="text-content-muted mb-8">
          O link pode estar desactualizado ou o produto já não está disponível. Continue a explorar a nossa loja.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-brand-600 text-white font-semibold hover:opacity-90 transition">
            <Home className="w-4 h-4" /> Ir para a loja
          </Link>
          <Link to="/rastrear-encomenda" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-border-default text-content-secondary font-semibold hover:bg-surface-raised transition">
            <Search className="w-4 h-4" /> Rastrear encomenda
          </Link>
        </div>
      </div>
    </section>
  );
};
