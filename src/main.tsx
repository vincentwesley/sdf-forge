import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './styles/app.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { bootDocument } from './boot';
import { testApi } from './testApi';
import fontUrl from '@fontsource/inter/files/inter-latin-800-normal.woff?url';
import { setFontData } from './core/text';

async function loadFont() {
  try {
    const res = await fetch(fontUrl);
    setFontData(await res.arrayBuffer());
  } catch (e) {
    console.warn('Could not load the text font', e);
  }
}

window.sdfForge = testApi;

// The bundled font is needed before text nodes can be compiled; load it first
// (fast: 31 kB) but never block the app if it fails.
loadFont()
  .finally(() => bootDocument(true))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </StrictMode>,
    );
  });
addEventListener('hashchange', () => bootDocument(false));
