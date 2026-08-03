/**
 * Zod-validated environment configuration.
 * Reads .env into process.env, then validates process.env — no secrets hardcoded.
 * Selects the appropriate IntakeMapper based on available env vars.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { IntakeMapper } from './intake/IntakeMapper.js';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(1).default(60),
});

export type Env = z.infer<typeof EnvSchema>;

let _env: Env | null = null;
const loadedDotEnvFiles = new Set<string>();

export function parseDotEnv(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equals = line.indexOf('=');
    if (equals <= 0) continue;

    const key = line.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(equals + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));

    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadDotEnv(filePath = resolve(process.cwd(), '.env')): void {
  if (process.env['QUOTENGINE_DISABLE_DOTENV'] === '1') return;
  if (loadedDotEnvFiles.has(filePath)) return;

  loadedDotEnvFiles.add(filePath);
  if (!existsSync(filePath)) return;

  const values = parseDotEnv(readFileSync(filePath, 'utf-8'));
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getEnv(): Env {
  if (_env) return _env;
  loadDotEnv();
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  _env = result.data;
  return _env;
}

/**
 * Create the appropriate IntakeMapper based on env.
 * If ANTHROPIC_API_KEY is set → ClaudeIntakeMapper (real).
 * Otherwise → MockIntakeMapper (offline).
 */
export async function createIntakeMapper(): Promise<IntakeMapper> {
  const env = getEnv();

  if (env.ANTHROPIC_API_KEY) {
    const { ClaudeIntakeMapper } = await import('./intake/ClaudeIntakeMapper.js');
    return new ClaudeIntakeMapper(env.ANTHROPIC_API_KEY);
  }

  const { MockIntakeMapper } = await import('./intake/MockIntakeMapper.js');
  return new MockIntakeMapper();
}
