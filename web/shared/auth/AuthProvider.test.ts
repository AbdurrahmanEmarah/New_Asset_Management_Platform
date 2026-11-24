import type { User } from 'oidc-client-ts';
import { describe, expect, it, vi } from 'vitest';
import { completeSignIn } from './AuthProvider';

describe('completeSignIn', () => {
  it('redeems a sign-in code only once even when called twice', async () => {
    const user = { access_token: 't' } as User;
    const manager = { signinRedirectCallback: vi.fn().mockResolvedValue(user) };
    const url = 'http://localhost:5173/auth/callback?code=abc&state=1';

    const [a, b] = await Promise.all([completeSignIn(manager, url), completeSignIn(manager, url)]);
    expect(a).toBe(user);
    expect(b).toBe(user);
    expect(manager.signinRedirectCallback).toHaveBeenCalledOnce();
  });

  it('redeems a new code from a later sign-in', async () => {
    const manager = { signinRedirectCallback: vi.fn().mockResolvedValue({} as User) };
    await completeSignIn(manager, 'http://x/auth/callback?code=1');
    await completeSignIn(manager, 'http://x/auth/callback?code=2');
    expect(manager.signinRedirectCallback).toHaveBeenCalledTimes(2);
  });
});
