/**
 * Tests for env.ts — Zod-validated environment loading and mapper selection.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('env — getEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['QUOTENGINE_DISABLE_DOTENV'] = '1';
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['PORT'];
    delete process.env['LOG_LEVEL'];
    delete process.env['RATE_LIMIT_MAX'];
    delete process.env['RATE_LIMIT_WINDOW_SECONDS'];
  });

  it('returns defaults when only required vars set', async () => {
    const { getEnv } = await import('../src/env.js');
    const env = getEnv();
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.RATE_LIMIT_MAX).toBe(60);
    expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it('accepts rate limit overrides and rejects non-positive values', async () => {
    process.env['RATE_LIMIT_MAX'] = '5';
    process.env['RATE_LIMIT_WINDOW_SECONDS'] = '10';
    const { getEnv } = await import('../src/env.js');
    expect(getEnv().RATE_LIMIT_MAX).toBe(5);
    expect(getEnv().RATE_LIMIT_WINDOW_SECONDS).toBe(10);

    vi.resetModules();
    process.env['RATE_LIMIT_MAX'] = '0';
    const fresh = await import('../src/env.js');
    expect(() => fresh.getEnv()).toThrow('Invalid environment configuration');
  });

  it('coerces PORT from string to number', async () => {
    process.env['PORT'] = '8080';
    const { getEnv } = await import('../src/env.js');
    expect(getEnv().PORT).toBe(8080);
  });

  it('rejects invalid LOG_LEVEL', async () => {
    process.env['LOG_LEVEL'] = 'verbose';
    const { getEnv } = await import('../src/env.js');
    expect(() => getEnv()).toThrow('Invalid environment configuration');
  });

  it('rejects invalid PORT (out of range)', async () => {
    process.env['PORT'] = '99999';
    const { getEnv } = await import('../src/env.js');
    expect(() => getEnv()).toThrow('Invalid environment configuration');
  });

  it('parses dotenv lines without overwriting existing env vars', async () => {
    const { parseDotEnv, loadDotEnv } = await import('../src/env.js');
    expect(parseDotEnv('PORT=4000\nLOG_LEVEL=debug # local\nQUOTED="hello world"\n')).toEqual({
      PORT: '4000',
      LOG_LEVEL: 'debug',
      QUOTED: 'hello world',
    });

    delete process.env['QUOTENGINE_DISABLE_DOTENV'];
    const dir = mkdtempSync(join(tmpdir(), 'quotengine-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'PORT=4000\nLOG_LEVEL=debug\n', 'utf-8');
    process.env['PORT'] = '5000';
    try {
      loadDotEnv(file);
      expect(process.env['PORT']).toBe('5000');
      expect(process.env['LOG_LEVEL']).toBe('debug');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('env — createIntakeMapper', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['QUOTENGINE_DISABLE_DOTENV'] = '1';
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('returns MockIntakeMapper when ANTHROPIC_API_KEY is not set', async () => {
    const { createIntakeMapper } = await import('../src/env.js');
    const mapper = await createIntakeMapper();
    expect(mapper.constructor.name).toBe('MockIntakeMapper');
  });

  it('returns ClaudeIntakeMapper when ANTHROPIC_API_KEY is set (no network call)', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-key-not-real';
    const { createIntakeMapper } = await import('../src/env.js');
    const mapper = await createIntakeMapper();
    expect(mapper.constructor.name).toBe('ClaudeIntakeMapper');
  });
});
