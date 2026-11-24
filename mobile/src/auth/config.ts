export type AuthConfig =
  | { ok: true; issuer: string; clientId: string }
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
  };
}

export function readAuthConfig(env: Env = publicEnv()): AuthConfig {
  const issuer = env.EXPO_PUBLIC_AUTH_ISSUER?.trim().replace(/\/+$/, '') ?? '';
  const clientId = env.EXPO_PUBLIC_AUTH_CLIENT_ID?.trim() ?? '';
  const missing = [
    ...(issuer ? [] : ['EXPO_PUBLIC_AUTH_ISSUER']),
    ...(clientId ? [] : ['EXPO_PUBLIC_AUTH_CLIENT_ID']),
  ];
  if (missing.length > 0) {
    return {
      ok: false,
      missing,
      message:
        `Sign-in is not set up: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} missing. ` +
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
  return { ok: true, issuer, clientId };
}
