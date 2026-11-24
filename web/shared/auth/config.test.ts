import { describe, expect, it } from 'vitest';
import { readAuthConfig } from './config';

describe('readAuthConfig', () => {
  it('explains how to fix missing settings', () => {
    expect(readAuthConfig({})).toContain('Start the web app through the AppHost');
  });

  it('returns the settings when present', () => {
    expect(readAuthConfig({ VITE_OIDC_AUTHORITY: 'http://kc/realms/x', VITE_OIDC_CLIENT_ID: 'admin-console' })).toEqual({
      authority: 'http://kc/realms/x',
      clientId: 'admin-console',
    });
  });
});
