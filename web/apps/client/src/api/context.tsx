import { createContext, useContext, type ReactNode } from 'react';
import type { AccessApi } from './access';
import type { AssetApis } from './assets';

const ApiContext = createContext<AccessApi | null>(null);

export function ApiProvider({ api, children }: { api: AccessApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): AccessApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}

const AssetApisContext = createContext<AssetApis | null>(null);

export function AssetApisProvider({ apis, children }: { apis: AssetApis; children: ReactNode }) {
  return <AssetApisContext.Provider value={apis}>{children}</AssetApisContext.Provider>;
}

export function useAssetApis(): AssetApis {
  const apis = useContext(AssetApisContext);
  if (!apis) throw new Error('useAssetApis must be used inside <AssetApisProvider>.');
  return apis;
}
