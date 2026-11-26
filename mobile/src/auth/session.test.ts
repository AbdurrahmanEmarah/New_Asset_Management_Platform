import { AccessDeniedError, type AccessApi, type Me } from '@/api/access';
import { refreshDelay, refreshSession, restoreSession, startSession, type SignedIn, type Tokens } from './session';
import { memoryTokenStore } from './tokenStore';

const me: Me = {
  userId: 'u1',
  name: 'Sam Field',
  email: 'sam@example.com',
  theme: 'light',
  company: { id: 'c1', name: 'Acme Facilities', slug: 'acme' },
  isOwner: false,
  permissions: [],
};

const tokens = (n: number): Tokens => ({ accessToken: `at${n}`, refreshToken: `rt${n}`, expiresIn: 300, issuedAt: 1_000 });
const access = (result: Promise<Me>): AccessApi => ({ me: () => result, savePreferences: jest.fn() });
const rejected = Object.assign(new Error('Token is not active'), { code: 'invalid_grant' });

describe('session', () => {
  it('signs in with the person from /me and keeps the refresh token', async () => {
    const store = memoryTokenStore();
    const session = await startSession(tokens(1), access(Promise.resolve(me)), store);
    expect(session).toMatchObject({ status: 'signed-in', user: { name: 'Sam Field' }, accessToken: 'at1', expiresAt: 1_300_000, me });
    expect(await store.read()).toBe('rt1');
  });

  it('shows the 403 reason as-is and forgets the token', async () => {
    const store = memoryTokenStore();
    const detail = 'Your account is turned off. Ask your company’s Inventra owner to turn it back on.';
    const session = await startSession(tokens(1), access(Promise.reject(new AccessDeniedError(detail))), store);
    expect(session).toEqual({ status: 'signed-out', error: detail });
    expect(await store.read()).toBeNull();
  });

  it('signs back in from the stored refresh token on start', async () => {
    const store = memoryTokenStore();
    await store.save('rt0');
    const refresh = jest.fn(async () => tokens(2));
    const session = await restoreSession(store, refresh, () => access(Promise.resolve(me)));
    expect(refresh).toHaveBeenCalledWith('rt0');
    expect(session).toMatchObject({ status: 'signed-in', accessToken: 'at2', refreshToken: 'rt2' });
    expect(await store.read()).toBe('rt2');
  });

  it('starts signed out when nothing is stored', async () => {
    const refresh = jest.fn();
    expect(await restoreSession(memoryTokenStore(), refresh, () => access(Promise.resolve(me)))).toEqual({ status: 'signed-out' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears a token the server rejects, but keeps it when there is no connection', async () => {
    const store = memoryTokenStore();
    await store.save('rt0');
    const offline = await restoreSession(store, async () => Promise.reject(new TypeError('Network request failed')), () => access(Promise.resolve(me)));
    expect(offline).toMatchObject({ status: 'signed-out', error: expect.stringContaining('No connection') });
    expect(await store.read()).toBe('rt0');

    const expired = await restoreSession(store, async () => Promise.reject(rejected), () => access(Promise.resolve(me)));
    expect(expired).toEqual({ status: 'signed-out', error: 'Your sign-in has expired. Sign in again.' });
    expect(await store.read()).toBeNull();
  });

  it('refreshes a minute before the access token expires', async () => {
    const store = memoryTokenStore();
    const session: SignedIn = { status: 'signed-in', user: { name: 'Sam' }, accessToken: 'at1', refreshToken: 'rt1', expiresAt: 1_300_000, demo: false };
    expect(refreshDelay(session, 1_000_000)).toBe(240_000);
    expect(refreshDelay({ ...session, demo: true }, 0)).toBeNull();

    const result = await refreshSession(session, store, async () => tokens(2));
    expect(result).toEqual({ session: { ...session, accessToken: 'at2', refreshToken: 'rt2', expiresAt: 1_300_000 } });
    expect(await store.read()).toBe('rt2');

    expect(await refreshSession(session, store, async () => Promise.reject(new TypeError('offline')))).toEqual({ retryInMs: 30_000 });
    expect(await refreshSession(session, store, async () => Promise.reject(rejected))).toEqual({
      session: { status: 'signed-out', error: 'Your sign-in has expired. Sign in again.' },
    });
    expect(await store.read()).toBeNull();
  });
});
