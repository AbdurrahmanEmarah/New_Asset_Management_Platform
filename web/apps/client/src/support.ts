import { setSharedHeader } from '../../../shared/api/http';
import type { AuthConfig } from '../../../shared/auth/config';

/**
 * Support mode: platform staff open http://<client app>/support#<pass header value> from the admin
 * console. The pass is kept in sessionStorage (this tab only) and sent as X-Support-Pass on every
 * API call; staff sign in with their platform account.
 */
const KEY = 'inventra.supportPass';
export const SUPPORT_PATH = '/support';
export const SUPPORT_HEADER = 'X-Support-Pass';

export function takeSupportPass(): string | null {
  try {
    if (window.location.pathname === SUPPORT_PATH) {
      const pass = window.location.hash.replace(/^#/, '').trim();
      if (pass) window.sessionStorage.setItem(KEY, pass);
      window.history.replaceState(null, '', '/');
    }
    const stored = window.sessionStorage.getItem(KEY);
    setSharedHeader(SUPPORT_HEADER, stored);
    return stored;
  } catch {
    return null;
  }
}

export function leaveSupport(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
  setSharedHeader(SUPPORT_HEADER, null);
}

/** The platform realm, for staff signing in on a support pass. */
export function readSupportAuthConfig(env: Record<string, string | undefined> = import.meta.env): AuthConfig | string {
  const authority = env.VITE_SUPPORT_OIDC_AUTHORITY;
  const clientId = env.VITE_SUPPORT_OIDC_CLIENT_ID;
  if (!authority || !clientId) {
    return 'Support sign-in is not configured: VITE_SUPPORT_OIDC_AUTHORITY and VITE_SUPPORT_OIDC_CLIENT_ID are missing. Start the web app through the AppHost, which sets them.';
  }
  return { authority, clientId };
}

export function inSupportMode(): boolean {
  try {
    return Boolean(window.sessionStorage.getItem(KEY));
  } catch {
    return false;
  }
}
