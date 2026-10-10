import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: true,
  },
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routesDirectory: './client/routes',
      generatedRouteTree: './client/routeTree.gen.ts',
    }),
    tailwindcss(),
    react(),
    cloudflare(),
  ],
  resolve: {
    alias: {
      '#server': path.resolve(import.meta.dirname, './server'),
      '#client': path.resolve(import.meta.dirname, './client'),
      '#components': path.resolve(import.meta.dirname, './client/components'),
      '#schema': path.resolve(import.meta.dirname, './db/schema'),
    },
  },
});
