import { ApiError, OfflineError } from './types';

export type Fetch = typeof fetch;
export type TokenSource = () => string;

/** The server refused (403), or the thing is outside the person's sites (404). `message` is shown as-is. */
export class AccessDeniedError extends ApiError {
  constructor(message: string) {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** The server refused the request for a reason the person must see (400, 409, 413). */
export class RefusedError extends ApiError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RefusedError';
  }
}

/** One JSON (or multipart) request through the gateway, with plain-language errors. */
export function createHttp(apiUrl: string, base: string, getToken: TokenSource, fetchImpl: Fetch = (...a) => fetch(...a)) {
  const root = `${apiUrl.replace(/\/+$/, '')}${base}`;

  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
    let response: Response;
    try {
      response = await fetchImpl(root + path, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${getToken()}`,
          ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new OfflineError(`Can't reach the Inventra server at ${apiUrl}. Check your signal and try again.`);
    }
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    const detail = await problemDetail(response);
    switch (response.status) {
      case 401:
        throw new ApiError('Your sign-in has expired. Sign in again.');
      case 403:
        throw new AccessDeniedError(detail ?? 'You are not allowed to do this. Ask your company’s Inventra owner.');
      case 404:
        throw new NotFoundError(detail ?? 'This was not found at your sites. It may have been moved or removed.');
      case 400:
      case 409:
      case 413:
        throw new RefusedError(detail ?? (response.status === 413 ? 'The file is too large. Use one up to 25 MB.' : 'The server refused this change.'), response.status);
      default:
        throw new ApiError(detail ?? `The server could not answer (error ${response.status}). Try again in a minute.`);
    }
  };
}

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
