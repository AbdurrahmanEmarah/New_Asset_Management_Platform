import { User, UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readAuthConfig } from './config';

export const CALLBACK_PATH = '/auth/callback';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signed-in'; user: User }
  | { status: 'misconfigured'; error: string };

export interface AuthContextValue {
  state: AuthState;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

let pendingCallback: { url: string; promise: Promise<User> } | null = null;

/**
 * Redeems the sign-in code exactly once per callback URL. A code can only be used once, and React
 * runs effects twice in development, so a second redemption would fail with "Code not valid".
 */
export function completeSignIn(manager: Pick<UserManager, 'signinRedirectCallback'>, url: string = window.location.href): Promise<User> {
  if (pendingCallback?.url !== url) pendingCallback = { url, promise: manager.signinRedirectCallback(url) };
  return pendingCallback.promise;
}

function createManager(authority: string, clientId: string) {
  const origin = window.location.origin;
  return new UserManager({
    authority,
    client_id: clientId,
    redirect_uri: `${origin}${CALLBACK_PATH}`,
    post_logout_redirect_uri: `${origin}/`,
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: true,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const config = useMemo(() => readAuthConfig(), []);
  const manager = useMemo(() => (typeof config === 'string' ? null : createManager(config.authority, config.clientId)), [config]);
  const [state, setState] = useState<AuthState>(() =>
    typeof config === 'string' ? { status: 'misconfigured', error: config } : { status: 'loading' },
  );

  useEffect(() => {
    if (!manager) return;
    let cancelled = false;

    async function start(m: UserManager) {
      try {
        if (window.location.pathname === CALLBACK_PATH) {
          const user = await completeSignIn(m);
          const returnTo = typeof user.state === 'string' && user.state.startsWith('/') ? user.state : '/';
          window.history.replaceState(null, '', returnTo);
          if (!cancelled) setState({ status: 'signed-in', user });
          return;
        }
        const user = await m.getUser();
        if (!cancelled) setState(user && !user.expired ? { status: 'signed-in', user } : { status: 'signed-out' });
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'signed-out',
            error: `Sign-in didn't finish (${e instanceof Error ? e.message : 'unknown error'}). Try again.`,
          });
        }
      }
    }

    void start(manager);
    const onLoaded = (user: User) => setState({ status: 'signed-in', user });
    const onSignedOut = () => setState({ status: 'signed-out' });
    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserSignedOut(onSignedOut);
    manager.events.addAccessTokenExpired(onSignedOut);
    return () => {
      cancelled = true;
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserSignedOut(onSignedOut);
      manager.events.removeAccessTokenExpired(onSignedOut);
    };
  }, [manager]);

  const signIn = useCallback(async () => {
    await manager?.signinRedirect({ state: window.location.pathname + window.location.search });
  }, [manager]);

  const signOut = useCallback(async () => {
    await manager?.signoutRedirect();
  }, [manager]);

  const getAccessToken = useCallback(async () => {
    const user = await manager?.getUser();
    return user && !user.expired ? user.access_token : null;
  }, [manager]);

  const value = useMemo(() => ({ state, signIn, signOut, getAccessToken }), [state, signIn, signOut, getAccessToken]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
