/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  /** "true" skips sign-in and uses the in-memory Access API (npm run dev:client:demo). */
  readonly VITE_DEMO_API?: string;
}
