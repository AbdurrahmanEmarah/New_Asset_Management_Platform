export type AuthConfig =
  | { ok: true; issuer: string; clientId: string; apiUrl: string }
  | { ok: false; message: string; missing: string[] };

type Env = Record<string, string | undefined>;

/**
 * Expo inlines EXPO_PUBLIC_* only when they are read as `process.env.NAME`,
 * so they are listed one by one here rather than looked up by a computed key.
 */
function publicEnv(): Env {
  return {
    EXPO_PUBLIC_AUTH_ISSUER: process.env.EXPO_PUBLIC_AUTH_ISSUER,
    EXPO_PUBLIC_AUTH_CLIENT_ID: process.env.EXPO_PUBLIC_AUTH_CLIENT_ID,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  };
}

export function readAuthConfig(env: Env = publicEnv()): AuthConfig {
  const issuer = env.EXPO_PUBLIC_AUTH_ISSUER?.trim().replace(/\/+$/, '') ?? '';
  const clientId = env.EXPO_PUBLIC_AUTH_CLIENT_ID?.trim() ?? '';
  const apiUrl = env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') ?? '';
  const missing = [
    ...(issuer ? [] : ['EXPO_PUBLIC_AUTH_ISSUER']),
    ...(clientId ? [] : ['EXPO_PUBLIC_AUTH_CLIENT_ID']),
    ...(apiUrl ? [] : ['EXPO_PUBLIC_API_URL']),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message:
        `Sign-in is not set up: ${joinAnd(missing)} ${missing.length === 1 ? 'is' : 'are'} missing. ` +
        'Copy mobile/.env.example to mobile/.env.local, fill it in, then restart "npx.cmd expo start".',
    };
  }
  if (!/^https?:\/\/[^/]+\/realms\/[^/]+$/.test(issuer)) {
    return {
      ok: false,
      missing: [],
      message: `EXPO_PUBLIC_AUTH_ISSUER should look like http://localhost:18080/realms/inventra, but it is "${issuer}".`,
    };
  }
  if (!/^https?:\/\/[^/]+$/.test(apiUrl)) {
    return {
      ok: false,
      missing: [],
      message: `EXPO_PUBLIC_API_URL should be the gateway's address, like http://localhost:5200, but it is "${apiUrl}".`,
    };
  }
  return { ok: true, issuer, clientId, apiUrl };
}

function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
