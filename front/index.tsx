import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { LanguageProvider } from './modules/core/contexts/LanguageContext';
import { ToastProvider } from './modules/core/contexts/ToastContext';
import { ConfirmProvider } from './modules/core/contexts/ConfirmContext';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, queryPersister, QUERY_CACHE_BUSTER } from './modules/core/lib/queryClient';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
const root = ReactDOM.createRoot(rootElement);
// Error boundary básico
try {
  root.render(
    <React.StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister!,
          maxAge: 24 * 60 * 60_000,
          buster: QUERY_CACHE_BUSTER,
          // só dados públicos marcados com meta.persist (nunca dados de admin/clientes)
          dehydrateOptions: { shouldDehydrateQuery: q => q.state.status === 'success' && q.meta?.persist === true },
        }}
      >
      <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
        <BrowserRouter>
          <LanguageProvider>
            <ToastProvider>
              <ConfirmProvider>
                <App />
              </ConfirmProvider>
            </ToastProvider>
          </LanguageProvider>
        </BrowserRouter>
      </GoogleOAuthProvider>
      </PersistQueryClientProvider>
    </React.StrictMode>
  );
} catch (error) {
  root.render(
    <div style={{ padding: '20px', fontFamily: 'Arial', color: '#000' }}>
      <h1>Erro ao carregar aplicação</h1>
      <p>Erro: {error instanceof Error ? error.message : String(error)}</p>
      <p>Stack: {error instanceof Error ? error.stack : 'N/A'}</p>
      <p>Verifique o console para mais detalhes.</p>
    </div>
  );
}