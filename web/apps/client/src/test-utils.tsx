import { render } from '@testing-library/react';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import type { AccessApi } from './api/access';
import { createDemoAccessApi, type DemoOptions } from './api/demo';
import type { AssetApis } from './api/assets';
import { createDemoAssetApis, type DemoAssetOptions } from './api/demoAssets';
import { Workspace } from './App';

/** Renders the signed-in workspace at a path, on the in-memory API (spied on, so calls can be checked). */
function spyAll<T extends object>(target: T): T {
  for (const key of Object.keys(target) as (keyof T)[]) {
    const fn = target[key];
    if (typeof fn === 'function' && !vi.isMockFunction(fn)) target[key] = vi.fn(fn as (...args: unknown[]) => unknown) as never;
  }
  return target;
}

export interface WorkspaceOptions extends DemoOptions {
  api?: Partial<AccessApi>;
  assets?: DemoAssetOptions & { catalog?: Partial<AssetApis['catalog']>; assets?: Partial<AssetApis['assets']>; documents?: Partial<AssetApis['documents']> };
}

export function renderWorkspace(path: string, options: WorkspaceOptions = {}) {
  const { api: overrides, assets: assetOptions = {}, ...demo } = options;
  const { catalog: catalogOverrides, assets: assetsOverrides, documents: documentsOverrides, ...assetDemo } = assetOptions;
  const demoAssets = createDemoAssetApis({ now: () => new Date('2026-11-24T12:00:00Z'), ...assetDemo });
  const assetApis: AssetApis = {
    catalog: spyAll({ ...demoAssets.catalog, ...catalogOverrides }),
    assets: spyAll({ ...demoAssets.assets, ...assetsOverrides }),
    documents: spyAll({ ...demoAssets.documents, ...documentsOverrides }),
  };
  const base = createDemoAccessApi({ now: () => new Date('2026-11-24T12:00:00Z'), ...demo });
  const api = { ...base, ...overrides } as AccessApi;
  for (const key of Object.keys(api) as (keyof AccessApi)[]) {
    if (!vi.isMockFunction(api[key])) api[key] = vi.fn(api[key]) as never;
  }
  window.history.pushState(null, '', path);
  const onSignOut = vi.fn();
  render(<ThemeProvider><Workspace api={api} assetApis={assetApis} onSignOut={onSignOut} /></ThemeProvider>);
  return { api, onSignOut, ...assetApis };
}
