import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    expect: { requireAssertions: true },
    coverage: {
      enabled: true,
      provider: 'v8',
      include: ['server/features/expenses/saveExpense.ts', 'server/lib/expenseHelper.ts', 'server/lib/indexing.ts'],
      reportOnFailure: true,
    },
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
