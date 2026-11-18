import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/app.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { bootDocument } from './boot';
import { testApi } from './testApi';

window.sdfForge = testApi;

bootDocument(true).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
});
addEventListener('hashchange', () => bootDocument(false));
