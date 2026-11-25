/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  /** The client web app, for "Open workspace" on a support pass. */
  readonly VITE_CLIENT_APP_URL?: string;
}
