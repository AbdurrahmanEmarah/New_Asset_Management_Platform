import { createContext, useContext, type ReactNode } from 'react';
import type { PlatformCatalogApi } from './catalog';
import type { SupportApi } from './support';
import type { TenancyApi } from './tenancy';

const ApiContext = createContext<TenancyApi | null>(null);
const SupportApiContext = createContext<SupportApi | null>(null);
const CatalogApiContext = createContext<PlatformCatalogApi | null>(null);

export function ApiProvider({ api, support, catalog, children }: { api: TenancyApi; support: SupportApi; catalog: PlatformCatalogApi; children: ReactNode }) {
  return (
    <ApiContext.Provider value={api}>
      <SupportApiContext.Provider value={support}>
        <CatalogApiContext.Provider value={catalog}>{children}</CatalogApiContext.Provider>
      </SupportApiContext.Provider>
    </ApiContext.Provider>
  );
}

export function useApi(): TenancyApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}

export function useSupportApi(): SupportApi {
  const api = useContext(SupportApiContext);
  if (!api) throw new Error('useSupportApi must be used inside <ApiProvider>.');
  return api;
}

export function useCatalogApi(): PlatformCatalogApi {
  const api = useContext(CatalogApiContext);
  if (!api) throw new Error('useCatalogApi must be used inside <ApiProvider>.');
  return api;
}
