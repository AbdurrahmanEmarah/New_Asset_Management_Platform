import { useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from '../../../shared/api/http';
import { AuthGate } from '../../../shared/auth/AuthGate';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useLoad } from '../../../shared/hooks';
import { Button, Gate, Notice } from '../../../shared/ui';
import { createAccessApi, type AccessApi } from './api/access';
import { ApiProvider } from './api/context';
import { createDemoAccessApi } from './api/demo';
import { SettingsLayout } from './components/SettingsLayout';
import { Shell } from './components/Shell';
import { MeProvider } from './me';
import { RolesPage } from './pages/RolesPage';
import { UsersPage } from './pages/UsersPage';

const TITLE = 'Sign in to your workspace';

export function App() {
  return (
    <AuthGate title={TITLE} signInHint="Sign in with the account your company gave you. Platform staff use the admin console instead.">
      <SignedIn />
    </AuthGate>
  );
}

function SignedIn() {
  const auth = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const api = useMemo(() => (apiUrl ? createAccessApi(apiUrl, auth.getAccessToken) : null), [apiUrl, auth.getAccessToken]);

  if (!api) {
    return <Gate title={TITLE}><Notice kind="error">The API address is not configured (VITE_API_URL). Start the web app through the AppHost, which sets it.</Notice></Gate>;
  }
  return <Workspace api={api} onSignOut={() => void auth.signOut()} />;
}

/** `npm run dev:client:demo`: no sign-in, in-memory data. */
export function DemoApp() {
  const [api] = useState(() => createDemoAccessApi());
  return <Workspace api={api} onSignOut={() => window.location.assign('/')} />;
}

export function Workspace({ api, onSignOut }: { api: AccessApi; onSignOut: () => void }) {
  const [me, reload] = useLoad(() => api.me(), [api]);

  if (me.status === 'error') {
    const noAccount = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Gate title={TITLE}>
        <Notice kind="error">
          {noAccount ? "You're signed in, but this account isn't a member of any company workspace. Ask your company's admin to invite you." : `Your profile didn't load: ${me.error.message}`}
        </Notice>
        <div style={{ display: 'flex', gap: 8 }}>
          {noAccount ? null : <Button onClick={reload}>Try again</Button>}
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </Gate>
    );
  }
  if (!me.data) return <Gate title={TITLE}><p className="muted" style={{ margin: 0 }}>Loading your workspace…</p></Gate>;

  return (
    <ApiProvider api={api}>
      <MeProvider me={me.data}>
        <BrowserRouter>
          <Shell onSignOut={onSignOut}>
            <Routes>
              <Route path="/settings" element={<SettingsLayout />}>
                <Route path="users" element={<UsersPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route index element={<Navigate to="users" replace />} />
              </Route>
              {/* Dashboard, assets and the rest arrive in later phases; until then Settings is home. */}
              <Route path="*" element={<Navigate to="/settings/users" replace />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </MeProvider>
    </ApiProvider>
  );
}
