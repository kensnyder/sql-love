import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      exclude: ['index.ts'],
    },
    globals: true,
  },
});
