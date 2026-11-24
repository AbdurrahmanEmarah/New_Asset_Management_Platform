import { createContext, useContext, type ReactNode } from 'react';
import type { TenancyApi } from './tenancy';

const ApiContext = createContext<TenancyApi | null>(null);

export function ApiProvider({ api, children }: { api: TenancyApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): TenancyApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}
