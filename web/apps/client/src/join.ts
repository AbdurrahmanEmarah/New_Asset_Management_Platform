/** The invitation token travels in the link's #fragment (never sent to servers or logs). It is kept
 * in sessionStorage across the sign-in redirect, which drops the fragment. */
const KEY = 'inventra.joinToken';

export const JOIN_PATH = '/join';

export function takeJoinToken(): string | null {
  const hash = window.location.hash.replace(/^#/, '').trim();
  try {
    if (hash) {
      window.sessionStorage.setItem(KEY, hash);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      return hash;
    }
    return window.sessionStorage.getItem(KEY);
  } catch {
    return hash || null;
  }
}

export function forgetJoinToken(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was kept.
  }
}
