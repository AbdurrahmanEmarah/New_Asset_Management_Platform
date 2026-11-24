/** An error from the server, already turned into words a person can act on. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The first error for a field, if any. */
  field(name: string): string | undefined {
    return this.fieldErrors[name]?.[0];
  }
}

export type TokenSource = () => Promise<string | null>;

interface Problem {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

export function messageFor(status: number, problem: Problem | null): string {
  if (problem?.detail) return problem.detail;
  if (problem?.title) return problem.title;
  switch (status) {
    case 401:
      return 'Your session has ended. Sign in again.';
    case 403:
      return "Your account isn't allowed to do this. Ask the Platform Owner for access.";
    case 404:
      return 'That item no longer exists.';
    default:
      return status >= 500
        ? 'The server had a problem. Try again in a moment; if it keeps happening, check the service logs in the Aspire dashboard.'
        : `The request failed (HTTP ${status}).`;
  }
}

export function createHttp(baseUrl: string, getToken: TokenSource) {
  return async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "Can't reach the server. Check that the platform is running (the AppHost) and try again.");
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    let problem: Problem | null = null;
    try {
      problem = (await response.json()) as Problem;
    } catch {
      problem = null;
    }
    throw new ApiError(response.status, messageFor(response.status, problem), problem?.errors ?? {});
  };
}
