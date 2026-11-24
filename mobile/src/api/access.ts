/**
 * The Access service, from docs/contracts/access.openapi.json (branch claude/backend-access).
 * Called through the gateway: <EXPO_PUBLIC_API_URL>/api/access/...
 */
import type { ThemeMode } from '@/theme/theme';
import { ApiError, OfflineError } from './types';

export type Me = {
  userId: string | null;
  name: string;
  email: string | null;
  theme: ThemeMode;
  company: { id: string; name: string; slug: string };
  isOwner: boolean;
  permissions: string[];
};

/** The server said this person may not use the app (403). `message` is the server's sentence, shown as-is. */
export class AccessDeniedError extends ApiError {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

type Fetch = typeof fetch;

export function createAccessApi(apiUrl: string, getToken: () => string, fetchImpl: Fetch = (...a) => fetch(...a)) {
  const base = `${apiUrl.replace(/\/+$/, '')}/api/access`;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetchImpl(base + path, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${getToken()}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new OfflineError(`Can't reach the Inventra server at ${apiUrl}. Check your signal and try again.`);
    }
    if (response.ok) return (await response.json()) as T;
    const detail = await problemDetail(response);
    if (response.status === 403) {
      throw new AccessDeniedError(detail ?? 'Your account is not allowed to use the field app. Ask your company’s Inventra owner.');
    }
    if (response.status === 401) throw new ApiError('Your sign-in has expired. Sign in again.');
    throw new ApiError(detail ?? `The server could not answer (error ${response.status}). Try again in a minute.`);
  }

  return {
    me: () => request<Me>('/me'),
    savePreferences: (theme: ThemeMode) => request<Me>('/me/preferences', { method: 'PUT', body: JSON.stringify({ theme }) }),
  };
}

export type AccessApi = ReturnType<typeof createAccessApi>;

async function problemDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: string | null; errors?: Record<string, string[]> };
    if (body.detail) return body.detail;
    const first = body.errors && Object.values(body.errors)[0]?.[0];
    return first ?? null;
  } catch {
    return null;
  }
}
