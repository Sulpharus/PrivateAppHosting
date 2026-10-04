import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { i18nReady, useLanguage } from './i18n.ts';
import './index.css';

// The language is the key: switching it remounts the app, so every text is made again.
function Root() {
  return <App key={useLanguage()} />;
}

const root = document.getElementById('root');
if (root)
  void i18nReady().then(() =>
    createRoot(root).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    ),
  );
