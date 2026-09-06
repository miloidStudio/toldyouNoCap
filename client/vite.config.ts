import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // host: true 讓同一個區網的手機也能連進開發伺服器測試
    host: true,
    port: 5173,
    fs: {
      // 允許讀取 client/ 之外的 shared/ 型別檔
      allow: [resolve(here, '..')],
    },
    proxy: {
      '/socket.io': {
        target: process.env.VITE_SERVER_URL ?? 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: process.env.VITE_SERVER_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
