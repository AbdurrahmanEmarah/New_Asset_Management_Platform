/**
 * The Access service, from docs/contracts/access.openapi.json.
 * Called through the gateway: <EXPO_PUBLIC_API_URL>/api/access/...
 */
import type { ThemeMode } from '@/theme/theme';
import { createHttp, type Fetch, type TokenSource } from './http';

export { AccessDeniedError } from './http';

export type Me = {
  userId: string | null;
  name: string;
  email: string | null;
  theme: ThemeMode;
  company: { id: string; name: string; slug: string };
  isOwner: boolean;
  permissions: string[];
};

export function createAccessApi(apiUrl: string, getToken: TokenSource, fetchImpl?: Fetch) {
  const request = createHttp(apiUrl, '/api/access', getToken, fetchImpl);
  return {
    me: () => request<Me>('/me'),
    savePreferences: (theme: ThemeMode) => request<Me>('/me/preferences', { method: 'PUT', body: JSON.stringify({ theme }) }),
  };
}

export type AccessApi = ReturnType<typeof createAccessApi>;
