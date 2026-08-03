import { z } from 'zod';
import { base64ToBytes } from './encoding.js';
import { HttpError } from './errors.js';
import {
  COMMERCIAL_CATALOG_APPROVAL_ID,
  COMMERCIAL_CATALOG_PRODUCTION_READY,
  COMMERCIAL_CATALOG_VERSION,
} from '../dental/commercialCatalog.js';

const RuntimeConfigSchema = z.object({
  ENVIRONMENT: z.enum(['staging', 'production']),
  ACCESS_AUD: z.string().min(1),
  ACCESS_TEAM_DOMAIN: z.string().min(1),
  ALLOWED_ORIGINS: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1),
  COMMERCIAL_CATALOG_APPROVED_ID: z.string().min(1),
  CONSENT_TEXT_SHA256: z.object({
    it: z.string().regex(/^[a-f0-9]{64}$/i),
    sq: z.string().regex(/^[a-f0-9]{64}$/i),
    en: z.string().regex(/^[a-f0-9]{64}$/i),
  }),
  CONSENT_VERSION: z.string().min(1),
  DATA_RETENTION_DAYS: z.coerce.number().int().min(1).max(365),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(30).max(3_650),
  PRIVACY_NOTICE_URL: z.string().url(),
  PRIVACY_NOTICE_SHA256: z.object({
    it: z.string().regex(/^[a-f0-9]{64}$/i),
    sq: z.string().regex(/^[a-f0-9]{64}$/i),
    en: z.string().regex(/^[a-f0-9]{64}$/i),
  }),
  STAGING_API_KEY: z.string().min(32).optional(),
  TURNSTILE_EXPECTED_ACTION: z.string().min(1).max(32),
  TURNSTILE_EXPECTED_HOSTNAME: z.string().min(1),
  TURNSTILE_SITE_KEY: z.string().min(1),
  ADMIN_API_KEY: z.string().min(32),
  ANTHROPIC_API_KEY: z.string().min(20),
  DATA_ENCRYPTION_KEY: z.string().min(40),
  TURNSTILE_SECRET_KEY: z.string().min(10),
});

export interface RuntimeConfig extends z.infer<typeof RuntimeConfigSchema> {
  readonly allowedOrigins: ReadonlySet<string>;
}

function validateProductionConfig(config: z.infer<typeof RuntimeConfigSchema>): void {
  const forbidden = ['replace-me', '.invalid', 'localhost', '127.0.0.1'];
  const publicValues = [
    config.ACCESS_AUD,
    config.ACCESS_TEAM_DOMAIN,
    config.ALLOWED_ORIGINS,
    config.COMMERCIAL_CATALOG_APPROVED_ID,
    ...Object.values(config.CONSENT_TEXT_SHA256),
    config.CONSENT_VERSION,
    config.PRIVACY_NOTICE_URL,
    ...Object.values(config.PRIVACY_NOTICE_SHA256),
    config.TURNSTILE_EXPECTED_HOSTNAME,
    config.TURNSTILE_SITE_KEY,
  ];
  if (publicValues.some((value) => forbidden.some((part) => value.includes(part)))) {
    throw new Error('Production configuration still contains a placeholder or local hostname');
  }
  if (config.TURNSTILE_SITE_KEY === '1x00000000000000000000AA') {
    throw new Error('Production configuration cannot use the Turnstile test site key');
  }
  if (!COMMERCIAL_CATALOG_PRODUCTION_READY) {
    throw new Error(
      `Commercial catalog ${COMMERCIAL_CATALOG_VERSION} is synthetic demo data or has unconfirmed tax/terms`,
    );
  }
  if (config.COMMERCIAL_CATALOG_APPROVED_ID !== COMMERCIAL_CATALOG_APPROVAL_ID) {
    throw new Error(
      `Production commercial catalog content ${COMMERCIAL_CATALOG_APPROVAL_ID} has not been explicitly approved`,
    );
  }
}

function parseOrigins(value: string): ReadonlySet<string> {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('ALLOWED_ORIGINS must contain at least one origin');

  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && url.hostname !== 'localhost')) {
      throw new Error(`Invalid allowed origin '${origin}'`);
    }
  }
  return new Set(origins);
}

export function getRuntimeConfig(env: Env): RuntimeConfig {
  const parsed = RuntimeConfigSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new HttpError(500, 'invalid_runtime_config', `Invalid runtime configuration: ${details}`);
  }
  try {
    if (base64ToBytes(parsed.data.DATA_ENCRYPTION_KEY).byteLength !== 32) {
      throw new Error('wrong length');
    }
  } catch {
    throw new HttpError(
      500,
      'invalid_runtime_config',
      'DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    );
  }
  if (parsed.data.ENVIRONMENT === 'staging' && !parsed.data.STAGING_API_KEY) {
    throw new HttpError(500, 'invalid_runtime_config', 'STAGING_API_KEY is required in staging');
  }
  if (parsed.data.ENVIRONMENT === 'production') validateProductionConfig(parsed.data);
  return { ...parsed.data, allowedOrigins: parseOrigins(parsed.data.ALLOWED_ORIGINS) };
}
