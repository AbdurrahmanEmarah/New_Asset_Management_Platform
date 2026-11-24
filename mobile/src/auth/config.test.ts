import { readAuthConfig } from './config';

describe('readAuthConfig', () => {
  it('reads the issuer and client id', () => {
    expect(
      readAuthConfig({ EXPO_PUBLIC_AUTH_ISSUER: 'http://localhost:18080/realms/inventra/', EXPO_PUBLIC_AUTH_CLIENT_ID: 'field-app' }),
    ).toEqual({ ok: true, issuer: 'http://localhost:18080/realms/inventra', clientId: 'field-app' });
  });

  it('says which settings are missing and how to fix it', () => {
    const config = readAuthConfig({});
    expect(config.ok).toBe(false);
    if (config.ok) return;
    expect(config.missing).toEqual(['EXPO_PUBLIC_AUTH_ISSUER', 'EXPO_PUBLIC_AUTH_CLIENT_ID']);
    expect(config.message).toBe(
      'Sign-in is not set up: EXPO_PUBLIC_AUTH_ISSUER and EXPO_PUBLIC_AUTH_CLIENT_ID are missing. ' +
        'Copy mobile/.env.example to mobile/.env.local, fill it in, then restart "npx.cmd expo start".',
    );
  });

  it('explains an issuer that is not a realm URL', () => {
    const config = readAuthConfig({ EXPO_PUBLIC_AUTH_ISSUER: 'http://localhost:18080', EXPO_PUBLIC_AUTH_CLIENT_ID: 'field-app' });
    expect(config).toMatchObject({ ok: false, message: expect.stringContaining('/realms/inventra') });
  });
});
