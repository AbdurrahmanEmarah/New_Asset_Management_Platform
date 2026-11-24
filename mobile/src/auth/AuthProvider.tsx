import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAccessApi, type AccessApi, type Me } from '@/api/access';
import { isThemeMode } from '@/theme/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { readAuthConfig, type AuthConfig } from './config';

// On the web, sign-in opens a pop-up; this closes it and hands the result back.
WebBrowser.maybeCompleteAuthSession();

export const REDIRECT_PATH = 'auth/callback';

export type User = { name: string; email?: string };

export type Session =
  | { status: 'signed-out'; error?: string }
  | { status: 'signing-in' }
  | { status: 'signed-in'; user: User; accessToken: string; demo: boolean; me?: Me };

type AuthValue = {
  session: Session;
  config: AuthConfig;
  /** Null when sign-in can start; otherwise why it can't, as a sentence. */
  cannotSignInReason: string | null;
  signIn: () => void;
  /** Development only: use the sample data without a Keycloak realm. */
  signInDemo: (() => void) | null;
  signOut: () => void;
  /** The Access service for the signed-in person; null in demo mode or when signed out. */
  access: AccessApi | null;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children, config = readAuthConfig() }: { children: ReactNode; config?: AuthConfig }) {
  return config.ok ? (
    <KeycloakAuth config={config}>{children}</KeycloakAuth>
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
      access: null,
    }),
    [session, config],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function KeycloakAuth({ children, config }: { children: ReactNode; config: Extract<AuthConfig, { ok: true }> }) {
  const discovery = AuthSession.useAutoDiscovery(config.issuer);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inventra', path: REDIRECT_PATH });
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      redirectUri,
      scopes: ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );
  const [session, setSession] = useState<Session>({ status: 'signed-out' });
  const { setMode } = useTheme();
  const access = useMemo(() => {
    if (session.status !== 'signed-in' || session.demo) return null;
    const accessToken = session.accessToken;
    return createAccessApi(config.apiUrl, () => accessToken);
  }, [session, config.apiUrl]);
  // A code can be redeemed once; StrictMode runs effects twice in development.
  const redeemed = useRef<string | null>(null);

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
        async (tokens) => {
          const result = await loadMe(
            createAccessApi(config.apiUrl, () => tokens.accessToken),
            tokens.accessToken,
            tokens.idToken,
          );
          if (result.status === 'signed-in' && result.me && isThemeMode(result.me.theme)) setMode(result.me.theme);
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
  }, [response, discovery, request, redirectUri, config.clientId, config.apiUrl, setMode]);

  const cannotSignInReason = !discovery
    ? `Can't reach the sign-in server at ${config.issuer}. Check that it is running and this device can reach it.`
    : !request
      ? 'Getting sign-in ready…'
      : null;

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
        setSession({ status: 'signed-out' });
      },
      access,
    }),
    [session, config, cannotSignInReason, promptAsync, access],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * After the token exchange: asks the Access service who this is (GET /api/access/me).
 * A 403 carries a sentence saying why the person can't use the app; it is shown as-is.
 */
export async function loadMe(access: AccessApi, accessToken: string, idToken?: string): Promise<Session> {
  try {
    const me = await access.me();
    return { status: 'signed-in', user: { name: me.name, email: me.email ?? undefined }, accessToken, demo: false, me };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'signed-out', error: message || `Signed in as ${userFromIdToken(idToken).name}, but could not load your account. Try again.` };
  }
}

/** Reads the name from the ID token. It was just received from the token endpoint, so it is not re-verified here. */
export function userFromIdToken(idToken: string | undefined): User {
  try {
    const payload = idToken?.split('.')[1];
    if (!payload) return { name: 'Signed in' };
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '='));
    const utf8 = decodeURIComponent(Array.from(json, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
    const claims = JSON.parse(utf8) as { name?: string; preferred_username?: string; email?: string };
    return { name: claims.name ?? claims.preferred_username ?? 'Signed in', email: claims.email };
  } catch {
    return { name: 'Signed in' };
  }
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
