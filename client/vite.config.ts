import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = 'http://localhost:3000';
const proxiedPaths = [
  '/whoami',
  '/auth',
  '/logout',
  '/analyze',
  '/saveDeal',
  '/deals',
  '/parse-listing',
  '/billing',
  '/agent-config',
  '/mcp',
  '/authorize',
  '/token',
  '/register',
  '/health',
  '/.well-known',
];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(proxiedPaths.map((path) => [path, backendUrl])),
  },
  build: {
    outDir: '../client-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
