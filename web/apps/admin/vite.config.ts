import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 5173);

// The admin console. Keycloak only accepts sign-in redirects to this exact port,
// so the server fails instead of silently moving to another port.
export default defineConfig({
  root,
  plugins: [react()],
  server: { port, strictPort: true, host: 'localhost' },
  preview: { port, strictPort: true },
  build: { outDir: fileURLToPath(new URL('../../dist/admin', import.meta.url)), emptyOutDir: true, sourcemap: true },
});
