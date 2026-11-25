/**
 * Catalog (asset types, templates), Assets (the register) and Documents, as the client web app uses them.
 * Types and HTTP clients in one file. Source of truth: docs/contracts/catalog.openapi.json,
 * assets.openapi.json and documents.openapi.json (Backend). Gateway prefixes /api/catalog,
 * /api/assets and /api/documents.
 */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { FieldDefinition, FieldInput, StatusDefinition, StatusInput, StatusMeaning, Template } from '../../../../shared/catalog/types';
import type { UsageState } from '../../../../shared/ui';

export * from '../../../../shared/catalog/types';

// ---- Catalog ----

export interface AssetType {
  id: string;
  name: string;
  tagPrefix: string;
  iconKey: string;
  fields: FieldDefinition[];
  statuses: StatusDefinition[];
  /** Goes up with every change. Edits send the version they started from; a newer one answers 409. */
  version: number;
  templateKey: string | null;
  isArchived: boolean;
  updatedAt: string;
}

export interface AssetTypeInput {
  name: string;
  tagPrefix: string;
  iconKey: string;
  fields: FieldInput[];
  statuses: StatusInput[];
  version: number | null;
}

export interface CatalogApi {
  types(includeArchived: boolean): Promise<AssetType[]>;
  type(id: string): Promise<AssetType>;
  createType(body: AssetTypeInput): Promise<AssetType>;
  updateType(id: string, body: AssetTypeInput): Promise<AssetType>;
  fromTemplate(templateKey: string, name: string | null, tagPrefix: string | null): Promise<AssetType>;
  archive(id: string): Promise<AssetType>;
  restore(id: string): Promise<AssetType>;
  templates(): Promise<Template[]>;
}

// ---- Assets ----

/** Values by field key: text, number, date (YYYY-MM-DD), choice (string, or string[] when multiple), ids for person/asset/file. */
export type FieldValues = Record<string, unknown>;
export interface StatusRef { key: string; label: string; meaning: StatusMeaning }
export interface AssetRef { id: string; tag: string; name: string }

export interface AssetSummary {
  id: string;
  tag: string;
  name: string;
  typeId: string;
  typeName: string;
  status: StatusRef;
  siteId: string | null;
  location: string;
  parentId: string | null;
  /** Only when the list is filtered to one type. */
  values: FieldValues | null;
  updatedAt: string;
  retiredAt: string | null;
}

export interface AssetPage {
  items: AssetSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** The type's fields, when the list is filtered to one type. */
  columns: FieldDefinition[];
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  typeId: string;
  typeName: string;
  typeVersion: number;
  fields: FieldDefinition[];
  statuses: StatusDefinition[];
  status: StatusRef;
  siteId: string | null;
  location: string;
  parent: AssetRef | null;
  childCount: number;
  values: FieldValues;
  /** Values of fields the type no longer has. Read-only. */
  otherValues: FieldValues;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
  retiredReason: string | null;
  cannotEditReason: string | null;
  cannotMoveReason: string | null;
  cannotRetireReason: string | null;
}

export type SortKey = 'tag' | 'name' | 'status' | 'updated' | `field:${string}`;

export interface AssetQuery {
  typeId: string | null;
  siteId: string | null;
  status: string | null;
  search: string;
  includeRetired: boolean;
  page: number;
  pageSize: number;
  sort: SortKey;
  order: 'asc' | 'desc';
  parentId?: string | null;
}

export interface NewAsset { typeId: string; name: string; statusKey: string; siteId: string | null; location: string; parentId: string | null; values: FieldValues }
export interface AssetChanges { name: string; statusKey: string; location: string; parentId: string | null; values: FieldValues }

export interface AssetsApi {
  list(query: AssetQuery): Promise<AssetPage>;
  get(id: string): Promise<Asset>;
  create(body: NewAsset): Promise<Asset>;
  update(id: string, body: AssetChanges): Promise<Asset>;
  children(id: string): Promise<AssetSummary[]>;
  move(id: string, siteId: string | null, location: string): Promise<Asset>;
  retire(id: string, reason: string): Promise<Asset>;
}

// ---- Documents ----

export interface DocumentFile {
  id: string;
  assetId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedByName: string;
  uploadedAt: string;
}

export interface StorageUsage { usedBytes: number; limitBytes: number; state: UsageState }

export interface DocumentsApi {
  list(assetId: string): Promise<DocumentFile[]>;
  upload(assetId: string, file: File): Promise<DocumentFile>;
  remove(id: string): Promise<void>;
  /** A short-lived (5 minute) download link. */
  link(id: string): Promise<{ url: string; expiresAt: string }>;
  usage(): Promise<StorageUsage>;
}

export interface AssetApis { catalog: CatalogApi; assets: AssetsApi; documents: DocumentsApi }

export function createAssetApis(gatewayUrl: string, getToken: TokenSource): AssetApis {
  const base = gatewayUrl.replace(/\/$/, '');
  const cat = createHttp(`${base}/api/catalog`, getToken);
  const ast = createHttp(`${base}/api/assets`, getToken);
  const doc = createHttp(`${base}/api/documents`, getToken);
  const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    catalog: {
      types: (includeArchived) => cat(`/types${includeArchived ? '?includeArchived=true' : ''}`),
      type: (id) => cat(`/types/${id}`),
      createType: (body) => cat('/types', json('POST', body)),
      updateType: (id, body) => cat(`/types/${id}`, json('PUT', body)),
      fromTemplate: (templateKey, name, tagPrefix) => cat('/types/from-template', json('POST', { templateKey, name, tagPrefix })),
      archive: (id) => cat(`/types/${id}/archive`, json('POST')),
      restore: (id) => cat(`/types/${id}/restore`, json('POST')),
      templates: () => cat('/templates'),
    },
    assets: {
      list: (q) => {
        const p = new URLSearchParams();
        if (q.typeId) p.set('typeId', q.typeId);
        if (q.siteId) p.set('siteId', q.siteId);
        if (q.status) p.set('status', q.status);
        if (q.parentId) p.set('parentId', q.parentId);
        if (q.search.trim()) p.set('search', q.search.trim());
        if (q.includeRetired) p.set('includeRetired', 'true');
        p.set('page', String(q.page));
        p.set('pageSize', String(q.pageSize));
        p.set('sort', q.sort);
        p.set('order', q.order);
        return ast(`/assets?${p.toString()}`);
      },
      get: (id) => ast(`/assets/${id}`),
      create: (body) => ast('/assets', json('POST', body)),
      update: (id, body) => ast(`/assets/${id}`, json('PUT', body)),
      children: (id) => ast(`/assets/${id}/children`),
      move: (id, siteId, location) => ast(`/assets/${id}/move`, json('POST', { siteId, location })),
      retire: (id, reason) => ast(`/assets/${id}/retire`, json('POST', { reason })),
    },
    documents: {
      list: (assetId) => doc(`/assets/${assetId}/documents`),
      upload: (assetId, file) => {
        const form = new FormData();
        form.append('file', file);
        return doc(`/assets/${assetId}/documents`, { method: 'POST', body: form });
      },
      remove: (id) => doc(`/documents/${id}`, { method: 'DELETE' }),
      link: (id) => doc(`/documents/${id}/link`, { method: 'POST' }),
      usage: () => doc('/usage'),
    },
  };
}

export const UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const sizeFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFmt.format(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${sizeFmt.format(bytes / 1024 ** 2)} MB`;
  return `${sizeFmt.format(bytes / 1024 ** 3)} GB`;
}
