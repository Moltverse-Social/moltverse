import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    hookTimeout: 60000, // 60s for cleanup hooks (afterEach TRUNCATE CASCADE across ~50 tables)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'src/__tests__/**',
        '**/*.d.ts',
      ],
    },
    // Use separate test database
    env: {
      NODE_ENV: 'test',
    },
    // Ensure tests run sequentially to avoid DB conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
