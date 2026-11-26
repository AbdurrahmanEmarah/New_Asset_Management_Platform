import { AccessDeniedError, type AccessApi, type Me } from '@/api/access';
import type { TokenStore } from './tokenStore';

/** What the token endpoint gives back (a subset of expo-auth-session's TokenResponse). */
export type Tokens = {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  /** Seconds the access token lives. */
  expiresIn?: number;
  /** Seconds since the epoch when it was issued. */
  issuedAt: number;
};

export type User = { name: string; email?: string };

export type SignedIn = {
  status: 'signed-in';
  user: User;
  accessToken: string;
  demo: boolean;
  me?: Me;
  refreshToken?: string;
  /** Milliseconds since the epoch when the access token expires. */
  expiresAt?: number;
};

export type Session =
  | { status: 'restoring' }
  | { status: 'signed-out'; error?: string }
  | { status: 'signing-in' }
  | SignedIn;

/** Refresh this long before the access token expires. */
export const REFRESH_MARGIN_MS = 60_000;

export function expiresAt(tokens: Tokens): number | undefined {
  return tokens.expiresIn ? (tokens.issuedAt + tokens.expiresIn) * 1000 : undefined;
}

/** Milliseconds until the session should be refreshed (never negative), or null when it has no expiry. */
export function refreshDelay(session: SignedIn, now: number): number | null {
  if (session.demo || !session.refreshToken || session.expiresAt === undefined) return null;
  return Math.max(0, session.expiresAt - REFRESH_MARGIN_MS - now);
}

/**
 * After the token endpoint answers: asks the Access service who this is (GET /api/access/me) and
 * keeps the refresh token. A 403 carries a sentence saying why the person can't use the app; it is shown as-is.
 */
export async function startSession(tokens: Tokens, access: AccessApi, store: TokenStore): Promise<Session> {
  try {
    const me = await access.me();
    if (tokens.refreshToken) await store.save(tokens.refreshToken);
    return {
      status: 'signed-in',
      user: { name: me.name, email: me.email ?? undefined },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: expiresAt(tokens),
      demo: false,
      me,
    };
  } catch (error) {
    if (error instanceof AccessDeniedError) await store.clear();
    return { status: 'signed-out', error: error instanceof Error ? error.message : String(error) };
  }
}

/** True when the token endpoint said the refresh token is no good (expired, revoked or signed out elsewhere). */
export function isRejected(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'invalid_grant' || code === 'invalid_client' || code === 'unauthorized_client';
}

/**
 * On app start: signs the person back in from the stored refresh token.
 * A rejected token is cleared; no connection keeps it, so the next start can try again.
 */
export async function restoreSession(
  store: TokenStore,
  refresh: (refreshToken: string) => Promise<Tokens>,
  accessFor: (accessToken: string) => AccessApi,
): Promise<Session> {
  let stored: string | null;
  try {
    stored = await store.read();
  } catch {
    return { status: 'signed-out' };
  }
  if (!stored) return { status: 'signed-out' };
  let tokens: Tokens;
  try {
    tokens = await refresh(stored);
  } catch (error) {
    if (isRejected(error)) {
      await store.clear();
      return { status: 'signed-out', error: 'Your sign-in has expired. Sign in again.' };
    }
    return {
      status: 'signed-out',
      error: 'No connection to the sign-in server, so you could not be signed back in. Find signal and sign in again.',
    };
  }
  return startSession({ ...tokens, refreshToken: tokens.refreshToken ?? stored }, accessFor(tokens.accessToken), store);
}

/** Refreshes a signed-in session before its access token expires. */
export async function refreshSession(
  session: SignedIn,
  store: TokenStore,
  refresh: (refreshToken: string) => Promise<Tokens>,
): Promise<{ session: Session } | { retryInMs: number }> {
  if (!session.refreshToken) return { session };
  try {
    const tokens = await refresh(session.refreshToken);
    const refreshToken = tokens.refreshToken ?? session.refreshToken;
    await store.save(refreshToken);
    return { session: { ...session, accessToken: tokens.accessToken, refreshToken, expiresAt: expiresAt(tokens) } };
  } catch (error) {
    if (isRejected(error)) {
      await store.clear();
      return { session: { status: 'signed-out', error: 'Your sign-in has expired. Sign in again.' } };
    }
    // No connection or a server hiccup: keep the session and try again shortly.
    return { retryInMs: 30_000 };
  }
}
