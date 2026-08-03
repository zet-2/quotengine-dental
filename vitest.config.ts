import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/worker/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/cli.ts',
        'src/server.ts',
        'src/eval/cli.ts',
        'src/dental/smoke.ts',
        'src/dental/server.ts',
        'src/worker/**',
        'src/**/types.ts',
        'src/intake/IntakeMapper.ts',
        'src/dental/DentalVisionMapper.ts',
      ],
      thresholds: {
        global: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
      reporter: ['text', 'lcov'],
    },
  },
});
