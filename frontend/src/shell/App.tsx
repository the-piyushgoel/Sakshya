import { useMemo } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { featureNavItems, featureRoutes } from './featureRegistry';
import { AppShell } from './Layout';
import { useAuth } from './auth';
import { LoginPage } from './LoginPage';
import { UiKitPage } from './UiKitPage';

export default function App() {
  const { user, loading } = useAuth();
  const navItems = useMemo(
    () => featureNavItems.filter((item) => !item.roles || item.roles.some((role) => user?.roles.includes(role))),
    [user],
  );

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Restoring secure session…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/ui-kit" replace /> : <LoginPage />} />
      {featureRoutes.filter((route) => route.public).map((route, index) => (
        <Route key={`public-${route.path}-${index}`} path={route.path} element={route.element} />
      ))}
      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <>
          <Route element={<AppShell navItems={navItems} />}>
            <Route index element={<Navigate to="/ui-kit" replace />} />
            <Route path="/ui-kit" element={<UiKitPage />} />
            {featureRoutes
              .filter((route) => !route.roles || route.roles.some((role) => user.roles.includes(role)))
              .map((route, index) => (
                <Route key={`${route.path}-${index}`} path={route.path} element={route.element} />
              ))}
            <Route path="*" element={<Navigate to="/ui-kit" replace />} />
          </Route>
        </>
      )}
    </Routes>
  );
}
