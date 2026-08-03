import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

type TestEnv = Env & { readonly TEST_MIGRATIONS: readonly D1Migration[] };

beforeAll(async () => {
  const bindings = env as TestEnv;
  await applyD1Migrations(bindings.LEADS_DB, bindings.TEST_MIGRATIONS);
});
