import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from '../../../shared/api/http';
import { AuthGate } from '../../../shared/auth/AuthGate';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useLoad } from '../../../shared/hooks';
import { Button, Gate, Notice } from '../../../shared/ui';
import { ApiProvider } from './api/context';
import { createSupportApi, type SupportApi } from './api/support';
import { createTenancyApi, type TenancyApi } from './api/tenancy';
import { Layout } from './components/Layout';
import { MeProvider } from './me';
import { AuditPage } from './pages/AuditPage';
import { ClientsPage } from './pages/ClientsPage';
import { PlansPage } from './pages/PlansPage';
import { SupportPage } from './pages/SupportPage';

export function App() {
  return (
    <AuthGate title="Platform admin" badge="ADMIN" signInHint="Sign in with your platform staff account. Client users sign in at their company's own address.">
      <SignedIn />
    </AuthGate>
  );
}

function SignedIn() {
  const auth = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const apis = useMemo(
    () => (apiUrl ? { api: createTenancyApi(apiUrl, auth.getAccessToken), support: createSupportApi(apiUrl, auth.getAccessToken) } : null),
    [apiUrl, auth.getAccessToken],
  );

  if (!apis) {
    return <Gate title="Platform admin" badge="ADMIN"><Notice kind="error">The API address is not configured (VITE_API_URL). Start the web app through the AppHost, which sets it.</Notice></Gate>;
  }
  return <Console {...apis} onSignOut={() => void auth.signOut()} />;
}

export function Console({ api, support, onSignOut }: { api: TenancyApi; support: SupportApi; onSignOut: () => void }) {
  const [me, reload] = useLoad(() => api.me(), [api]);

  if (me.status === 'error') {
    const noRole = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Gate title="Platform admin" badge="ADMIN">
        <Notice kind="error">
          {noRole ? "You're signed in, but your account has no platform role. Ask the Platform Owner to give you the Owner, Support or Billing role." : `Your profile didn't load: ${me.error.message}`}
        </Notice>
        <div style={{ display: 'flex', gap: 8 }}>
          {noRole ? null : <Button onClick={reload}>Try again</Button>}
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </Gate>
    );
  }
  if (!me.data) return <Gate title="Platform admin" badge="ADMIN"><p className="muted" style={{ margin: 0 }}>Loading your profile…</p></Gate>;

  return (
    <ApiProvider api={api} support={support}>
      <MeProvider me={me.data}>
        <BrowserRouter>
          <Layout onSignOut={onSignOut}>
            <Routes>
              <Route path="/" element={<ClientsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </MeProvider>
    </ApiProvider>
  );
}
