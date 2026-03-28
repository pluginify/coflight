import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  resolve: {
    preserveSymlinks: false,
  },
  test: {
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
