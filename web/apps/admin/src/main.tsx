import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '../../../shared/auth/AuthProvider';
import { ThemeProvider } from '../../../shared/theme/ThemeProvider';
import '../../../shared/theme/tokens.css';
import '../../../shared/ui/ui.css';
import './admin.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
