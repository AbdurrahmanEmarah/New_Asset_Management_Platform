import { createContext, useContext, type ReactNode } from 'react';
import type { SupportApi } from './support';
import type { TenancyApi } from './tenancy';

const ApiContext = createContext<TenancyApi | null>(null);
const SupportApiContext = createContext<SupportApi | null>(null);

export function ApiProvider({ api, support, children }: { api: TenancyApi; support: SupportApi; children: ReactNode }) {
  return (
    <ApiContext.Provider value={api}>
      <SupportApiContext.Provider value={support}>{children}</SupportApiContext.Provider>
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
