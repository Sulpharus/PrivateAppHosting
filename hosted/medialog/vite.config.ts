import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Tailwind is compiled at build time; the App Kit comes from the gate (/_mininode/ui.css).
export default defineConfig({ plugins: [react(), tailwindcss()], build: { target: 'es2022' } });
