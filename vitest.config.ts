import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    setupFiles: ['tests/network-guard.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    testTimeout: 10000,
  },
});
