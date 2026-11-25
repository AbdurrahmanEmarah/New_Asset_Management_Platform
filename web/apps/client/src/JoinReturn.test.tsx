import { act, render, screen } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue, AuthState } from '../../../shared/auth/AuthProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';

// A tiny external store standing in for AuthProvider, so the test can finish "sign-in" the way the
// real provider does: move the address back to the saved path, then flip the state to signed-in.
let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
const setState = (next: AuthState) => {
  state = next;
  listeners.forEach((l) => l());
};

vi.mock('../../../shared/auth/AuthProvider', () => ({
  useAuth: (): AuthContextValue => {
    const current = useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => state,
    );
    return { state: current, signIn: async () => {}, signOut: async () => {}, getAccessToken: async () => 'token' };
  },
}));

const { App } = await import('./App');

afterEach(() => {
  state = { status: 'loading' };
  window.sessionStorage.clear();
});

describe('returning from sign-in to an invitation', () => {
  it('shows the Join step, not the workspace, once sign-in finishes on /join', async () => {
    window.sessionStorage.setItem('inventra.joinToken', 'client-1.abc');
    window.history.replaceState(null, '', '/auth/callback?code=x&state=y');
    render(<ThemeProvider><App /></ThemeProvider>);
    expect(screen.getByText('Sign in to your workspace')).toBeInTheDocument();

    await act(async () => {
      window.history.replaceState(null, '', '/join');
      setState({ status: 'signed-in', user: {} as never });
    });

    expect(screen.getByText('Join your company on Inventra')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to your workspace')).not.toBeInTheDocument();
  });
});
