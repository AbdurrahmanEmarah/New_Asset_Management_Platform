import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../../shared/auth/AuthProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import '../../../shared/theme/tokens.css';
import '../../../shared/ui/ui.css';
import './client.css';
import { App, DemoApp } from './App';

const demo = import.meta.env.VITE_DEMO_API === 'true';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      {demo ? <DemoApp /> : (
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    </ThemeProvider>
  </StrictMode>,
);
