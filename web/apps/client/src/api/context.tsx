import { createContext, useContext, type ReactNode } from 'react';
import type { AccessApi } from './access';

const ApiContext = createContext<AccessApi | null>(null);

export function ApiProvider({ api, children }: { api: AccessApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): AccessApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiProvider>.');
  return api;
}
