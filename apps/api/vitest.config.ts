import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration files share one database and truncate it between tests.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
