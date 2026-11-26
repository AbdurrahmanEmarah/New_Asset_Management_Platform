import { createSender } from '@/offline/send';
import { MockWorkOrdersApi } from './mock';
import { createAssetsApi } from './assets';
import { OfflineError } from './types';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const summary = (tag: string) => ({ id: `id-${tag}`, tag, name: tag, typeName: 'Chiller', status: { key: 'ok', label: 'In service', meaning: 'ok' }, location: 'Roof', retiredAt: null });

describe('assets api', () => {
  it('finds an asset by exact tag through the gateway', async () => {
    const fetchImpl = jest.fn(async () => json(200, { items: [summary('INV-004170'), summary('INV-00417')], total: 2 }));
    const api = createAssetsApi('http://x/', () => 'tok', fetchImpl);
    expect(await api.findByTag('inv-00417')).toMatchObject({ id: 'id-INV-00417' });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://x/api/assets/assets?search=inv-00417&pageSize=20');
  });

  it('says nothing was found when only similar tags match', async () => {
    const api = createAssetsApi('http://x', () => 't', jest.fn(async () => json(200, { items: [summary('INV-004170')] })));
    expect(await api.findByTag('INV-00417')).toBeNull();
  });

  it('treats an asset outside my sites (404) as not found', async () => {
    const api = createAssetsApi('http://x', () => 't', jest.fn(async () => json(404, { detail: 'Not found.' })));
    expect(await api.getAsset('a1')).toBeNull();
  });

  it('gets a download link from Documents', async () => {
    const fetchImpl = jest.fn(async () => json(200, { url: 'https://blob/1', expiresAt: '2026-11-26T10:05:00Z' }));
    expect(await createAssetsApi('http://x', () => 't', fetchImpl).documentLink('d1')).toBe('https://blob/1');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://x/api/documents/documents/d1/link');
  });

  it('uploads a photo as the multipart field "file"', async () => {
    const fetchImpl = jest.fn(async () => json(201, { id: 'd9' }));
    await createAssetsApi('http://x', () => 't', fetchImpl).uploadDocument('a1', { uri: 'file:///p.jpg', name: 'p.jpg', type: 'image/jpeg' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://x/api/documents/assets/a1/documents');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });
});

describe('photo sender', () => {
  const photo = { kind: 'asset.photo' as const, assetId: 'a1', assetTag: 'INV-1', uri: 'file:///p.jpg', fileName: 'p.jpg', contentType: 'image/jpeg' };

  it('reports the server’s refusal as a conflict', async () => {
    const detail = 'Your company has used its 10 GB of storage. Delete old documents or ask your owner to upgrade.';
    const assets = createAssetsApi('http://x', () => 't', jest.fn(async () => json(409, { detail })));
    expect(await createSender({ jobs: new MockWorkOrdersApi(), assets })(photo)).toEqual({ status: 'conflict', message: detail });
  });

  it('keeps the photo for later when there is no signal', async () => {
    const assets = createAssetsApi('http://x', () => 't', jest.fn(async () => Promise.reject(new TypeError('Network request failed'))));
    await expect(createSender({ jobs: new MockWorkOrdersApi(), assets })(photo)).rejects.toBeInstanceOf(OfflineError);
  });
});
