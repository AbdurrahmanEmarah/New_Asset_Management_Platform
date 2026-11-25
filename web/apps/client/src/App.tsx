import { useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { ApiError } from '../../../shared/api/http';
import { AuthGate } from '../../../shared/auth/AuthGate';
import { useAuth } from '../../../shared/auth/AuthProvider';
import { useLoad } from '../../../shared/hooks';
import { useTheme } from '../../../shared/theme/ThemeProvider';
import { Button, Gate, Notice } from '../../../shared/ui';
import { createAccessApi, type AcceptedInvitation, type AccessApi } from './api/access';
import { createAssetApis, type AssetApis } from './api/assets';
import { ApiProvider, AssetApisProvider } from './api/context';
import { createDemoAccessApi } from './api/demo';
import { createDemoAssetApis } from './api/demoAssets';
import { SettingsLayout } from './components/SettingsLayout';
import { Shell } from './components/Shell';
import { forgetJoinToken, JOIN_PATH, takeJoinToken } from './join';
import { MeProvider } from './me';
import { inSupportMode, leaveSupport } from './support';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AssetFormPage } from './pages/AssetFormPage';
import { AssetTypesPage } from './pages/AssetTypesPage';
import { JoinPage } from './pages/JoinPage';
import { RegisterPage } from './pages/RegisterPage';
import { RolesPage } from './pages/RolesPage';
import { SitesPage } from './pages/SitesPage';
import { SupportPassesPage } from './pages/SupportPassesPage';
import { UsersPage } from './pages/UsersPage';

const TITLE = 'Sign in to your workspace';
const JOIN_TITLE = 'Join your company on Inventra';
const isJoin = () => window.location.pathname === JOIN_PATH;

export function App() {
  // Subscribing to the sign-in state makes App render again when sign-in finishes. The callback
  // moves the address from /auth/callback back to /join with history.replaceState, which React
  // doesn't notice on its own; without this, an invitee who just signed in landed in the
  // workspace ("not linked to a company") instead of on the Join step.
  useAuth();
  if (isJoin()) return <JoinRoute />;
  return (
    <AuthGate title={inSupportMode() ? 'Support sign-in' : TITLE}
      signInHint={inSupportMode() ? "You're opening a client's workspace on a support pass. Sign in with your platform staff account." : 'Sign in with the account your company gave you. Platform staff use the admin console instead.'}>
      <SignedIn />
    </AuthGate>
  );
}

function useApiFromEnv(): AccessApi | null {
  const auth = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  return useMemo(() => (apiUrl ? createAccessApi(apiUrl, auth.getAccessToken) : null), [apiUrl, auth.getAccessToken]);
}

const NO_API = <Notice kind="error">The API address is not configured (VITE_API_URL). Start the web app through the AppHost, which sets it.</Notice>;

function SignedIn() {
  const auth = useAuth();
  const api = useApiFromEnv();
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  const assetApis = useMemo(() => (apiUrl ? createAssetApis(apiUrl, auth.getAccessToken) : null), [apiUrl, auth.getAccessToken]);
  if (!api || !assetApis) return <Gate title={TITLE}>{NO_API}</Gate>;
  return <Workspace api={api} assetApis={assetApis} onSignOut={() => { leaveSupport(); void auth.signOut(); }} />;
}

/** /join#<token>: sign in (or create an account) with the invited email, then accept. */
function JoinRoute() {
  const auth = useAuth();
  const api = useApiFromEnv();
  const [token] = useState(takeJoinToken);

  if (!token) {
    return <Gate title={JOIN_TITLE}><Notice kind="error">This invitation link is incomplete. Open the whole link you were sent, or ask your company's Admin for a new one.</Notice></Gate>;
  }
  if (!api) return <Gate title={JOIN_TITLE}>{NO_API}</Gate>;

  const joined = (result: AcceptedInvitation) => {
    forgetJoinToken();
    // The sign-in token must be refreshed so it carries the company.
    if (result.signInAgain) void auth.signIn('/');
    else window.location.assign('/');
  };

  return (
    <AuthGate title={JOIN_TITLE} signInHint="You've been invited to a company workspace. Sign in, or create your account, with the email address the invitation was sent to.">
      <Gate title={JOIN_TITLE}>
        <JoinPage api={api} token={token} onJoined={joined} />
      </Gate>
    </AuthGate>
  );
}

/** `npm run dev:client:demo`: no sign-in, in-memory data. */
export function DemoApp() {
  const [api] = useState(() => createDemoAccessApi());
  const [assetApis] = useState(() => createDemoAssetApis());
  if (isJoin()) {
    const token = takeJoinToken();
    return (
      <Gate title={JOIN_TITLE}>
        {token ? <JoinPage api={api} token={token} onJoined={() => { forgetJoinToken(); window.location.assign('/'); }} /> : <Notice kind="error">This invitation link is incomplete.</Notice>}
      </Gate>
    );
  }
  return <Workspace api={api} assetApis={assetApis} onSignOut={() => window.location.assign('/')} />;
}

export function Workspace({ api, assetApis, onSignOut }: { api: AccessApi; assetApis: AssetApis; onSignOut: () => void }) {
  const { setMode } = useTheme();
  // The theme saved on the person's profile wins over this browser's, so it follows them between devices.
  const [me, reload] = useLoad(() => api.me().then((m) => {
    setMode(m.theme);
    return m;
  }), [api]);

  if (me.status === 'error') {
    // 403 explains why this person can't use the app (not linked, deactivated, company suspended): show it as written.
    const refused = me.error instanceof ApiError && me.error.status === 403;
    return (
      <Gate title={TITLE}>
        <Notice kind="error">{refused ? me.error.message : `Your profile didn't load: ${me.error.message}`}</Notice>
        <div style={{ display: 'flex', gap: 8 }}>
          {refused ? null : <Button onClick={reload}>Try again</Button>}
          <Button onClick={onSignOut}>Sign out</Button>
        </div>
      </Gate>
    );
  }
  if (!me.data) return <Gate title={TITLE}><p className="muted" style={{ margin: 0 }}>Loading your workspace…</p></Gate>;

  return (
    <ApiProvider api={api}>
      <AssetApisProvider apis={assetApis}>
      <MeProvider me={me.data}>
        <BrowserRouter>
          <Shell onSignOut={onSignOut}>
            <Routes>
              <Route path="/settings" element={<SettingsLayout />}>
                <Route path="users" element={<UsersPage />} />
                <Route path="roles" element={<RolesPage />} />
                <Route path="sites" element={<SitesPage />} />
                <Route path="support" element={<SupportPassesPage />} />
                <Route path="asset-types" element={<AssetTypesPage />} />
                <Route index element={<Navigate to="users" replace />} />
              </Route>
              <Route path="/assets" element={<RegisterPage />} />
              <Route path="/assets/new" element={<AssetFormPage />} />
              <Route path="/assets/:id" element={<AssetDetailPage />} />
              <Route path="/assets/:id/edit" element={<AssetFormPage />} />
              {/* The dashboard arrives later; until then the register is home. */}
              <Route path="*" element={<Navigate to="/assets" replace />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </MeProvider>
      </AssetApisProvider>
    </ApiProvider>
  );
}
