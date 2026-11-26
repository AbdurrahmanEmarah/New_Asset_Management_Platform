import type { Asset, AssetDocument, AssetsApi } from './assets';
import { RefusedError } from './http';
import { OfflineError } from './types';

const field = (key: string, label: string, kind: Asset['fields'][number]['kind'], order: number, unit?: string) => ({
  key,
  label,
  kind,
  required: false,
  order,
  rules: { unit: unit ?? null },
});

const chillerFields = [
  field('manufacturer', 'Manufacturer', 'text', 1),
  field('capacity', 'Cooling capacity', 'number', 2, 'kW'),
  field('installed', 'Installed', 'date', 3),
  field('refrigerant', 'Refrigerant', 'choice', 4),
];

function asset(id: string, tag: string, name: string, location: string, values: Record<string, unknown>, status: Asset['status'] = { key: 'in_service', label: 'In service', meaning: 'ok' }): Asset {
  return {
    id,
    tag,
    name,
    typeId: 'type-chiller',
    typeName: name.startsWith('Fire') ? 'Fire pump' : 'Chiller',
    status,
    location,
    retiredAt: null,
    fields: chillerFields,
    values,
    parent: null,
    childCount: 0,
    updatedAt: '2026-11-20T09:00:00Z',
  };
}

export const sampleAssets: Asset[] = [
  asset('a-102', 'INV-00102', 'Fire pump FP-1', 'Tower B · Basement 2', { manufacturer: 'Grundfos', installed: '2019-03-14' }, {
    key: 'fault',
    label: 'Out of order',
    meaning: 'fault',
  }),
  asset('a-417', 'INV-00417', 'Chiller CH-2', 'Tower B · Roof', { manufacturer: 'Carrier', capacity: 850, installed: '2021-06-01', refrigerant: 'R-134a' }, {
    key: 'attention',
    label: 'Needs attention',
    meaning: 'warn',
  }),
  asset('a-418', 'INV-00418', 'Chiller CH-3', 'Tower B · Roof', { manufacturer: 'Carrier', capacity: 850, installed: '2021-06-01', refrigerant: 'R-134a' }),
];

/** Sample Assets and Documents API for demo mode and tests. */
export class MockAssetsApi implements AssetsApi {
  private assets: Asset[];
  private documents: AssetDocument[] = [
    {
      id: 'd-1',
      assetId: 'a-417',
      fileName: 'CH-2 service manual.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2_400_000,
      uploadedByName: 'Office',
      uploadedAt: '2026-10-02T10:00:00Z',
    },
  ];
  online = true;

  constructor(options: { latency?: number } = {}) {
    this.assets = structuredClone(sampleAssets);
    this.latency = options.latency ?? 300;
  }

  private readonly latency: number;

  private async wait() {
    if (this.latency > 0) await new Promise((r) => setTimeout(r, this.latency));
    if (!this.online) throw new OfflineError();
  }

  async findByTag(tag: string) {
    await this.wait();
    return structuredClone(this.assets.find((a) => a.tag.toUpperCase() === tag.trim().toUpperCase()) ?? null);
  }

  async getAsset(id: string) {
    await this.wait();
    return structuredClone(this.assets.find((a) => a.id === id) ?? null);
  }

  async listDocuments(assetId: string) {
    await this.wait();
    return structuredClone(this.documents.filter((d) => d.assetId === assetId));
  }

  async documentLink(id: string) {
    await this.wait();
    return `https://example.com/sample-documents/${id}`;
  }

  async uploadDocument(assetId: string, file: { name: string; type: string; sizeBytes?: number }) {
    await this.wait();
    if ((file.sizeBytes ?? 0) > 25 * 1024 * 1024) throw new RefusedError('The file is too large. Use one up to 25 MB.', 413);
    const doc: AssetDocument = {
      id: `d-${this.documents.length + 1}`,
      assetId,
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.sizeBytes ?? 0,
      uploadedByName: 'Demo technician',
      uploadedAt: new Date().toISOString(),
    };
    this.documents.push(doc);
    return doc;
  }
}
