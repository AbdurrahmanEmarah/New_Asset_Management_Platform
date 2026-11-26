import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { demoAssets } from '@/api';
import { createAccessApi, type AccessApi } from '@/api/access';
import { createAssetsApi, type AssetsApi } from '@/api/assets';
import { isThemeMode } from '@/theme/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { readAuthConfig, type AuthConfig } from './config';
import { refreshDelay, refreshSession, restoreSession, startSession, type Session, type Tokens } from './session';
import { defaultTokenStore, type TokenStore } from './tokenStore';

export type { Session, User } from './session';

// On the web, sign-in opens a pop-up; this closes it and hands the result back.
WebBrowser.maybeCompleteAuthSession();

export const REDIRECT_PATH = 'auth/callback';

type AuthValue = {
  session: Session;
  config: AuthConfig;
  /** Null when sign-in can start; otherwise why it can't, as a sentence. */
  cannotSignInReason: string | null;
  signIn: () => void;
  /** Development only: use the sample data without a Keycloak realm. */
  signInDemo: (() => void) | null;
  signOut: () => void;
  /** False on the web, where the sign-in lasts only until the tab closes. */
  staysSignedIn: boolean;
  /** The Access service for the signed-in person; null in demo mode or when signed out. */
  access: AccessApi | null;
  /** Assets and Documents for the signed-in person (sample data in demo mode); null when signed out. */
  assets: AssetsApi | null;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  config = readAuthConfig(),
  store = defaultTokenStore,
}: {
  children: ReactNode;
  config?: AuthConfig;
  store?: TokenStore;
}) {
  return config.ok ? (
    <KeycloakAuth config={config} store={store}>
      {children}
    </KeycloakAuth>
  ) : (
    <NoAuth config={config}>{children}</NoAuth>
  );
}

const demoSession: Session = { status: 'signed-in', user: { name: 'Demo technician' }, accessToken: '', demo: true };

function NoAuth({ children, config }: { children: ReactNode; config: Extract<AuthConfig, { ok: false }> }) {
  const [session, setSession] = useState<Session>({ status: 'signed-out' });
  const value = useMemo<AuthValue>(
    () => ({
      session,
      config,
      cannotSignInReason: config.message,
      signIn: () => setSession({ status: 'signed-out', error: config.message }),
      signInDemo: __DEV__ ? () => setSession(demoSession) : null,
      signOut: () => setSession({ status: 'signed-out' }),
      staysSignedIn: false,
      access: null,
      assets: session.status === 'signed-in' ? demoAssets : null,
    }),
    [session, config],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function toTokens(t: AuthSession.TokenResponse): Tokens {
  return { accessToken: t.accessToken, refreshToken: t.refreshToken, idToken: t.idToken, expiresIn: t.expiresIn, issuedAt: t.issuedAt };
}

function KeycloakAuth({
  children,
  config,
  store,
}: {
  children: ReactNode;
  config: Extract<AuthConfig, { ok: true }>;
  store: TokenStore;
}) {
  const discovery = AuthSession.useAutoDiscovery(config.issuer);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inventra', path: REDIRECT_PATH });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      redirectUri,
      // offline_access: a refresh token that outlives the browser session, so technicians stay signed in.
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );
  const [session, setSession] = useState<Session>({ status: 'restoring' });
  const { setMode } = useTheme();
  // A code can be redeemed once; StrictMode runs effects twice in development.
  const redeemed = useRef<string | null>(null);

  const accessFor = useMemo(() => (token: string) => createAccessApi(config.apiUrl, () => token), [config.apiUrl]);

  const applyTheme = useMemo(
    () => (s: Session) => {
      if (s.status === 'signed-in' && s.me && isThemeMode(s.me.theme)) setMode(s.me.theme);
    },
    [setMode],
  );

  // On start: sign back in from the stored refresh token.
  useEffect(() => {
    let active = true;
    const refresh = async (refreshToken: string) => {
      const doc = await AuthSession.fetchDiscoveryAsync(config.issuer);
      return toTokens(await AuthSession.refreshAsync({ clientId: config.clientId, refreshToken }, doc));
    };
    restoreSession(store, refresh, accessFor).then((s) => {
      if (!active) return;
      applyTheme(s);
      setSession((current) => (current.status === 'restoring' ? s : current));
    });
    return () => {
      active = false;
    };
  }, [store, config.issuer, config.clientId, accessFor, applyTheme]);

  // Refresh the access token a minute before it expires.
  useEffect(() => {
    if (session.status !== 'signed-in' || !discovery) return;
    const delay = refreshDelay(session, Date.now());
    if (delay === null) return;
    const current = session;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      refreshSession(current, store, async (rt) =>
        toTokens(await AuthSession.refreshAsync({ clientId: config.clientId, refreshToken: rt }, discovery)),
      ).then((result) => {
        if ('session' in result) setSession((s) => (s === current ? result.session : s));
        else timer = setTimeout(run, result.retryInMs);
      });
    };
    timer = setTimeout(run, delay);
    return () => clearTimeout(timer);
  }, [session, discovery, store, config.clientId]);

  // After the sign-in page: redeem the code, then ask Access who this is.
  useEffect(() => {
    if (!response || !discovery || !request) return;
    if (response.type === 'success') {
      const code = response.params.code;
      if (!code || redeemed.current === code) return;
      redeemed.current = code;
      AuthSession.exchangeCodeAsync(
        { clientId: config.clientId, code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
        discovery,
      ).then(
        async (t) => {
          const result = await startSession(toTokens(t), accessFor(t.accessToken), store);
          applyTheme(result);
          setSession(result);
        },
        (error: unknown) =>
          setSession({
            status: 'signed-out',
            error: `Sign-in did not finish: ${error instanceof Error ? error.message : String(error)}. Try again.`,
          }),
      );
    } else if (response.type === 'error') {
      const detail = response.params.error_description ?? response.error?.message ?? 'the sign-in page returned an error';
      queueMicrotask(() => setSession({ status: 'signed-out', error: `Sign-in did not finish: ${detail}. Try again.` }));
    } else if (response.type === 'cancel' || response.type === 'dismiss') {
      queueMicrotask(() => setSession({ status: 'signed-out' }));
    }
  }, [response, discovery, request, redirectUri, config.clientId, accessFor, store, applyTheme]);

  const cannotSignInReason = !discovery
    ? `Can't reach the sign-in server at ${config.issuer}. Check that it is running and this device can reach it.`
    : !request
      ? 'Getting sign-in ready…'
      : null;

  const apis = useMemo(() => {
    if (session.status !== 'signed-in') return { access: null, assets: null };
    if (session.demo) return { access: null, assets: demoAssets };
    const token = session.accessToken;
    return { access: accessFor(token), assets: createAssetsApi(config.apiUrl, () => token) };
  }, [session, accessFor, config.apiUrl]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      config,
      cannotSignInReason,
      signIn: () => {
        setSession({ status: 'signing-in' });
        promptAsync().then(
          (result) => {
            if (result.type !== 'success') setSession({ status: 'signed-out' });
          },
          (error: unknown) =>
            setSession({ status: 'signed-out', error: `Could not open the sign-in page: ${error instanceof Error ? error.message : String(error)}` }),
        );
      },
      signInDemo: __DEV__ ? () => setSession(demoSession) : null,
      signOut: () => {
        redeemed.current = null;
        void store.clear();
        setSession({ status: 'signed-out' });
      },
      staysSignedIn: store.persistent,
      ...apis,
    }),
    [session, config, cannotSignInReason, promptAsync, store, apis],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
