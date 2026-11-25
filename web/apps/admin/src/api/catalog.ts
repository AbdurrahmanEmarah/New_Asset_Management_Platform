/** The platform's template library, served by Catalog at /api/catalog/platform/templates (docs/contracts/catalog.openapi.json). */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { FieldInput, StatusInput, Template } from '../../../../shared/catalog/types';

export interface TemplateInput {
  name: string;
  description: string;
  category: string;
  tagPrefix: string;
  iconKey: string;
  fields: FieldInput[];
  statuses: StatusInput[];
}

export interface PlatformCatalogApi {
  templates(): Promise<Template[]>;
  /** Creates or replaces. Clients' types already copied from it don't change. */
  saveTemplate(key: string, body: TemplateInput): Promise<Template>;
  deleteTemplate(key: string): Promise<void>;
}

export function createPlatformCatalogApi(gatewayUrl: string, getToken: TokenSource): PlatformCatalogApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/catalog/platform/templates`, getToken);
  return {
    templates: () => request(''),
    saveTemplate: (key, body) => request(`/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteTemplate: (key) => request(`/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  };
}
