import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readAuthConfig, type AuthConfig } from './config';

// On the web, sign-in opens a pop-up; this closes it and hands the result back.
WebBrowser.maybeCompleteAuthSession();

export const REDIRECT_PATH = 'auth';

export type User = { name: string; email?: string };

export type Session =
  | { status: 'signed-out'; error?: string }
  | { status: 'signing-in' }
  | { status: 'signed-in'; user: User; accessToken: string; demo: boolean };

type AuthValue = {
  session: Session;
  config: AuthConfig;
  /** Null when sign-in can start; otherwise why it can't, as a sentence. */
  cannotSignInReason: string | null;
  signIn: () => void;
  /** Development only: use the sample data without a Keycloak realm. */
  signInDemo: (() => void) | null;
  signOut: () => void;
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
    }),
    [session, config],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function KeycloakAuth({ children, config }: { children: ReactNode; config: Extract<AuthConfig, { ok: true }> }) {
  const discovery = AuthSession.useAutoDiscovery(config.issuer);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'inventra-field', path: REDIRECT_PATH });
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
        (tokens) =>
          setSession({ status: 'signed-in', user: userFromIdToken(tokens.idToken), accessToken: tokens.accessToken, demo: false }),
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
  }, [response, discovery, request, redirectUri, config.clientId]);

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
    }),
    [session, config, cannotSignInReason, promptAsync],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
