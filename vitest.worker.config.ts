import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const directory = path.dirname(fileURLToPath(import.meta.url));
const testSecrets = {
  ADMIN_API_KEY: 'admin-api-key-with-at-least-32-characters',
  ANTHROPIC_API_KEY: 'anthropic-test-key-with-at-least-20-chars',
  DATA_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  STAGING_API_KEY: 'staging-api-key-with-at-least-32-characters',
  TURNSTILE_SECRET_KEY: 'turnstile-test-secret',
} as const;

Object.assign(process.env, testSecrets);

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          ...testSecrets,
          TEST_MIGRATIONS: await readD1Migrations(path.join(directory, 'migrations')),
        },
      },
    })),
  ],
  test: {
    include: ['test/worker/**/*.test.ts'],
    setupFiles: ['test/worker/setup.ts'],
  },
});
