import { act, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHttp } from '../../../shared/api/http';
import { createDemoAccessApi } from './api/demo';
import { inSupportMode, leaveSupport, readSupportAuthConfig, takeSupportPass } from './support';
import { renderWorkspace } from './test-utils';

describe('Support mode', () => {
  afterEach(() => leaveSupport());

  it('keeps the pass out of the address bar and sends it on every API call', async () => {
    window.history.pushState(null, '', '/support#c1.p1');
    expect(takeSupportPass()).toBe('c1.p1');
    expect(window.location.pathname).toBe('/');
    expect(window.location.hash).toBe('');
    expect(inSupportMode()).toBe(true);

    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 200 }));
    await createHttp('http://api', async () => 'token')('/me');
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('X-Support-Pass')).toBe('c1.p1');

    leaveSupport();
    await createHttp('http://api', async () => 'token')('/me');
    expect(new Headers(fetch.mock.calls[1]![1]!.headers).get('X-Support-Pass')).toBeNull();
    fetch.mockRestore();
  });

  it('signs in with the platform realm', () => {
    expect(readSupportAuthConfig({ VITE_SUPPORT_OIDC_AUTHORITY: 'http://kc/realms/inventra-platform', VITE_SUPPORT_OIDC_CLIENT_ID: 'support-web' }))
      .toEqual({ authority: 'http://kc/realms/inventra-platform', clientId: 'support-web' });
    expect(readSupportAuthConfig({})).toMatch(/VITE_SUPPORT_OIDC_AUTHORITY/);
  });

  it('shows the banner and disables changes on a read-only pass', async () => {
    const base = createDemoAccessApi();
    const me = vi.fn(async () => ({ ...(await base.me()), supportSession: { passId: 'p1', access: 'read' as const, expiresAt: '2026-11-24T12:30:00Z' } }));
    renderWorkspace('/assets/a2', { api: { me } });
    expect(await screen.findByText(/Support session: you're in Gulf Facilities Co./)).toBeInTheDocument();
    for (const name of ['Edit', 'Move', 'Retire']) {
      expect(await screen.findByRole('button', { name })).toHaveAccessibleDescription('Read-only support pass');
    }
  });
});

describe('Users list refresh', () => {
  it('reloads when the window regains focus, and every 10 s while invited people are shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api } = renderWorkspace('/settings/users');
    await screen.findByText('Layla Aziz');
    const calls = () => vi.mocked(api.listUsers).mock.calls.length;
    const before = calls();
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(calls()).toBe(before + 1));
    await act(async () => { vi.advanceTimersByTime(10_000); });
    await waitFor(() => expect(calls()).toBe(before + 2));
    vi.useRealTimers();
  });
});
