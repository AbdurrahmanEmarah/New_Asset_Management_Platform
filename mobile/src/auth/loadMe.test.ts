import { AccessDeniedError, type AccessApi, type Me } from '@/api/access';
import { loadMe } from './AuthProvider';

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

const me: Me = {
  userId: 'u1',
  name: 'Sam Field',
  email: 'sam@example.com',
  theme: 'light',
  company: { id: 'c1', name: 'Acme Facilities', slug: 'acme' },
  isOwner: false,
  permissions: [],
};

function accessReturning(result: Promise<Me>): AccessApi {
  return { me: () => result, savePreferences: jest.fn() };
}

describe('loadMe', () => {
  it('signs in with the person from /me', async () => {
    const session = await loadMe(accessReturning(Promise.resolve(me)), 'tok');
    expect(session).toMatchObject({ status: 'signed-in', user: { name: 'Sam Field', email: 'sam@example.com' }, me });
  });

  it('shows the 403 reason as-is and does not sign in', async () => {
    const detail = 'Your account is turned off. Ask your company’s Inventra owner to turn it back on.';
    const session = await loadMe(accessReturning(Promise.reject(new AccessDeniedError(detail))), 'tok');
    expect(session).toEqual({ status: 'signed-out', error: detail });
  });
});
