import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
  plugins: [],
  resolve: {
    alias: {
      '#server': path.resolve(__dirname, './server'),
      '#client': path.resolve(__dirname, './client'),
      '#components': path.resolve(__dirname, './client/components'),
      '#schema': path.resolve(__dirname, './db/schema'),
    },
  },
});
