import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createHttp } from './http';

afterEach(() => vi.unstubAllGlobals());

describe('http', () => {
  it('sends the token and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = createHttp('http://api', async () => 'abc');

    await expect(request<{ ok: boolean }>('/x')).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0]![1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer abc');
  });

  it('turns a validation problem into field errors', async () => {
    const body = { title: 'Some fields need attention.', detail: 'Fix the highlighted fields and try again.', errors: { slug: ['Sub-domain is required.'] } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));
    const error = await createHttp('', async () => null)('/clients', { method: 'POST', body: '{}' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).field('slug')).toBe('Sub-domain is required.');
    expect((error as ApiError).message).toBe('Fix the highlighted fields and try again.');
  });

  it('explains a network failure instead of showing a stack trace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(createHttp('', async () => null)('/x')).rejects.toThrow("Can't reach the server");
  });
});
