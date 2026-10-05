import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource-variable/literata';
import '@fontsource-variable/plus-jakarta-sans';
import './index.css';
import { TranslationProvider } from './contexts/TranslationContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TranslationProvider>
      <App />
    </TranslationProvider>
  </StrictMode>,
);
