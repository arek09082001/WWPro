import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for WWPro.
 * The scheduling engine is pure TypeScript, so tests run in a plain Node environment.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: [
      'engine/__tests__/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'features/**/__tests__/**/*.test.ts',
    ],
    environment: 'node',
  },
});
