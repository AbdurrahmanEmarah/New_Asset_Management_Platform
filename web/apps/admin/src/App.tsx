import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from '../../../shared/api/http';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useLoad } from '../../../shared/hooks';
import { Button, Notice, ThemeSwitch } from '../../../shared/ui';
import { ApiProvider } from './api/context';
import { createTenancyApi, type TenancyApi } from './api/tenancy';
import { LogoMark } from './components/Icons';
import { Layout } from './components/Layout';
import { MeProvider } from './me';
import { AuditPage } from './pages/AuditPage';
import { ClientsPage } from './pages/ClientsPage';
import { PlansPage } from './pages/PlansPage';

export function App() {
  const auth = useAuth();
  const { state } = auth;

  if (state.status === 'misconfigured') return <Gate><Notice kind="error">{state.error}</Notice></Gate>;
  if (state.status === 'loading') return <Gate><p className="muted" style={{ margin: 0 }}>Checking your sign-in…</p></Gate>;
  if (state.status === 'signed-out') {
    return (
      <Gate>
        {state.error ? <Notice kind="error">{state.error}</Notice> : null}
        <p className="muted" style={{ margin: 0 }}>Sign in with your platform staff account. Client users sign in at their company's own address.</p>
        <Button variant="primary" onClick={() => void auth.signIn()}>Sign in</Button>
      </Gate>
    );
  }
  return <SignedIn />;
}

function SignedIn() {
  const auth = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const api = useMemo(() => (apiUrl ? createTenancyApi(apiUrl, auth.getAccessToken) : null), [apiUrl, auth.getAccessToken]);

  if (!api) {
    return <Gate><Notice kind="error">The API address is not configured (VITE_API_URL). Start the web app through the AppHost, which sets it.</Notice></Gate>;
  }
  return <Console api={api} onSignOut={() => void auth.signOut()} />;
}

export function Console({ api, onSignOut }: { api: TenancyApi; onSignOut: () => void }) {
  const [me, reload] = useLoad(() => api.me(), [api]);

  if (me.status === 'error') {
    const noRole = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Gate>
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
  if (!me.data) return <Gate><p className="muted" style={{ margin: 0 }}>Loading your profile…</p></Gate>;

  return (
    <ApiProvider api={api}>
      <MeProvider me={me.data}>
        <BrowserRouter>
          <Layout onSignOut={onSignOut}>
            <Routes>
              <Route path="/" element={<ClientsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/audit" element={<AuditPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </MeProvider>
    </ApiProvider>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <div className="gate">
      <div className="card gate-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>inventra</span>
          <span className="side-badge">ADMIN</span>
        </div>
        <h1 style={{ margin: 0, fontSize: 24 }}>Platform admin</h1>
        {children}
        <div style={{ marginTop: 8 }}><ThemeSwitch /></div>
      </div>
    </div>
  );
}
