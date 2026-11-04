import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '../../modules/core/components/layout/Layout';
import { User } from '../../modules/core/types/types';
import { getActivePageFromPath, getAdminPath } from '../../modules/core/routes/adminRoutes';

const ContentLoader = () => (
  <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-label="A carregar">
    <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
  </div>
);

interface AdminLayoutProps {
  currentUser: User;
  isDarkMode: boolean;
  toggleTheme: () => void;
  onLogout: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentUser,
  isDarkMode,
  toggleTheme,
  onLogout
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const handleNavigate = (page: string) => {
    const route = getAdminPath(page);
    navigate(route);
  };
  
  return (
    <Layout
      currentUser={currentUser}
      activePage={getActivePageFromPath(location.pathname)}
      onNavigate={handleNavigate}
      onLogout={onLogout}
      isDarkMode={isDarkMode}
      toggleTheme={toggleTheme}
    >
      {/* Suspense aqui (e não à volta do layout): ao abrir uma página pela 1.ª vez só o
          conteúdo mostra o carregamento — cabeçalho, menu e barra inferior ficam no lugar */}
      <Suspense fallback={<ContentLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
};
