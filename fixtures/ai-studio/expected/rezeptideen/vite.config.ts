import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tailwind is compiled at build time instead of the CDN script (the CSP blocks external scripts).
export default defineConfig({ plugins: [react(), tailwindcss()], build: { target: 'es2022' } });
