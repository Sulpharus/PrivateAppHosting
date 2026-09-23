import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // supabase-js + React make up most of the main chunk (~170 kB gzipped).
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 },
});
