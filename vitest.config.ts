import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
    }),
  ],
  resolve: {
    alias: {
      '#server': path.resolve(__dirname, './server'),
      '#client': path.resolve(__dirname, './client'),
      '#components': path.resolve(__dirname, './client/components'),
    },
  },
});
