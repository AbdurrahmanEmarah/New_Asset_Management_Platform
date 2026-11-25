import { AccessDeniedError, createAccessApi } from './access';
import { OfflineError } from './types';

function reply(status: number, body: unknown) {
  return jest.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('access api', () => {
  it('gets me with the token', async () => {
    const fetchImpl = reply(200, { name: 'Sam Field', theme: 'light' });
    const api = createAccessApi('http://localhost:5200/', () => 'tok', fetchImpl);
    expect(await api.me()).toMatchObject({ name: 'Sam Field' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:5200/api/access/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('passes the 403 detail through as-is', async () => {
    const detail = 'Your company’s subscription is paused. Ask your Inventra owner to renew it.';
    const api = createAccessApi('http://x', () => 't', reply(403, { status: 403, detail }));
    await expect(api.me()).rejects.toEqual(new AccessDeniedError(detail));
  });

  it('saves the theme', async () => {
    const fetchImpl = reply(200, { name: 'Sam', theme: 'dark' });
    await createAccessApi('http://x', () => 't', fetchImpl).savePreferences('dark');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/access/me/preferences');
    expect(init).toMatchObject({ method: 'PUT', body: '{"theme":"dark"}' });
  });

  it('says plainly when the server cannot be reached', async () => {
    const api = createAccessApi('http://x', () => 't', jest.fn(async () => Promise.reject(new TypeError('Network request failed'))));
    await expect(api.me()).rejects.toBeInstanceOf(OfflineError);
  });
});
