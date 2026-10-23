import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], maxWorkers: 6, testTimeout: 30000, hookTimeout: 30000 },
});
