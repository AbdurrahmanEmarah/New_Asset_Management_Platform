import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../../shared/auth/AuthProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import '../../../shared/theme/tokens.css';
import '../../../shared/ui/ui.css';
import './client.css';
import { App, DemoApp } from './App';
import { readSupportAuthConfig, takeSupportPass } from './support';

const demo = import.meta.env.VITE_DEMO_API === 'true';
// A support pass from the admin console switches sign-in to the platform realm for this tab.
const supportPass = demo ? null : takeSupportPass();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {demo ? <DemoApp /> : (
        <AuthProvider config={supportPass ? readSupportAuthConfig() : undefined}>
          <App />
        </AuthProvider>
      )}
    </ThemeProvider>
  </StrictMode>,
);
