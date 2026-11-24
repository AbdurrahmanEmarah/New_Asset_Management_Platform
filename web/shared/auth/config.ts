export interface AuthConfig {
  authority: string;
  clientId: string;
}

/** Reads sign-in settings that the AppHost passes in as VITE_* variables. */
export function readAuthConfig(env: Record<string, string | undefined> = import.meta.env): AuthConfig | string {
  const authority = env.VITE_OIDC_AUTHORITY;
  const clientId = env.VITE_OIDC_CLIENT_ID;
  if (!authority || !clientId) {
    return 'Sign-in is not configured: VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID are missing. Start the web app through the AppHost (dotnet run --project src/AppHost/Inventra.AppHost), which sets them.';
  }
  return { authority, clientId };
}
