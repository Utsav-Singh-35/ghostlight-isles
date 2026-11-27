import { defineConfig } from 'vitest/config';

// Start tests with `npm test` (scripts/vitest.mjs), which also works when a tool launches it
// from a lowercase Windows drive letter.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
