/**
 * The Assets and Documents services, from docs/contracts/assets.openapi.json and documents.openapi.json.
 * Gateway: <EXPO_PUBLIC_API_URL>/api/assets/... and /api/documents/...
 * Site scope: an asset outside the person's sites answers 404.
 */
import { createHttp, NotFoundError, type Fetch, type TokenSource } from './http';
import type { StatusKind } from './types';

export type FieldKind = 'text' | 'number' | 'date' | 'choice' | 'person' | 'asset' | 'file';

export type FieldDefinition = {
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  order: number;
  rules: { unit?: string | null; decimals?: number | null; multiple?: boolean; options?: string[] | null };
};

export type StatusRef = { key: string; label: string; meaning: StatusKind };

export type AssetSummary = {
  id: string;
  tag: string;
  name: string;
  typeName: string;
  status: StatusRef;
  location: string;
  retiredAt: string | null;
};

export type Asset = AssetSummary & {
  typeId: string;
  fields: FieldDefinition[];
  values: Record<string, unknown>;
  parent: { id: string; tag: string; name: string } | null;
  childCount: number;
  updatedAt: string;
};

export type AssetDocument = {
  id: string;
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
};

/** A file on the phone, ready to upload. */
export type LocalFile = { uri: string; name: string; type: string; sizeBytes?: number };

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface AssetsApi {
  /** The asset whose tag is exactly `tag` (ignoring case), or null when none is at the person's sites. */
  findByTag(tag: string): Promise<AssetSummary | null>;
  /** Null when the asset does not exist or is outside the person's sites (404). */
  getAsset(id: string): Promise<Asset | null>;
  listDocuments(assetId: string): Promise<AssetDocument[]>;
  /** A short-lived (5 minute) download link. */
  documentLink(id: string): Promise<string>;
  uploadDocument(assetId: string, file: LocalFile): Promise<AssetDocument>;
}

export function createAssetsApi(apiUrl: string, getToken: TokenSource, fetchImpl?: Fetch): AssetsApi {
  const assets = createHttp(apiUrl, '/api/assets', getToken, fetchImpl);
  const documents = createHttp(apiUrl, '/api/documents', getToken, fetchImpl);

  return {
    async findByTag(tag) {
      const wanted = tag.trim().toUpperCase();
      const page = await assets<{ items: AssetSummary[] }>(`/assets?search=${encodeURIComponent(tag.trim())}&pageSize=20`);
      return page.items.find((a) => a.tag.toUpperCase() === wanted) ?? null;
    },
    async getAsset(id) {
      try {
        return await assets<Asset>(`/assets/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },
    listDocuments: (assetId) => documents<AssetDocument[]>(`/assets/${encodeURIComponent(assetId)}/documents`),
    documentLink: async (id) => (await documents<{ url: string }>(`/documents/${encodeURIComponent(id)}/link`)).url,
    async uploadDocument(assetId, file) {
      const form = new FormData();
      const part = await formFile(file);
      // React Native takes {uri, name, type} as the value; a browser takes a Blob plus its file name.
      if (part instanceof Blob) form.append('file', part, file.name);
      else form.append('file', part as unknown as Blob);
      return documents<AssetDocument>(`/assets/${encodeURIComponent(assetId)}/documents`, { method: 'POST', body: form });
    },
  };
}

/** React Native sends {uri, name, type}; a browser needs a real Blob. */
async function formFile(file: LocalFile): Promise<Blob | { uri: string; name: string; type: string }> {
  if (typeof document !== 'undefined' && (file.uri.startsWith('blob:') || file.uri.startsWith('data:'))) {
    return (await fetch(file.uri)).blob();
  }
  return { uri: file.uri, name: file.name, type: file.type };
}
