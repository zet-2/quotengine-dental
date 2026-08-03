import { z } from 'zod';
import type { RuntimeConfig } from './config.js';
import { HttpError } from './errors.js';
import { requireIdempotencyKey } from './idempotency.js';
import type { TurnstileResult } from './types.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const ALWAYS_PASS_TEST_SITE_KEY = '1x00000000000000000000AA';
const SITEVERIFY_TIMEOUT_MS = 8_000;
const PATIENT_TOKEN_ERROR_CODES = new Set([
  'invalid-input-response',
  'timeout-or-duplicate',
]);

const SiteverifyResponseSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

export type TurnstileVerifier = (
  token: string,
  request: Request,
  config: RuntimeConfig,
) => Promise<TurnstileResult>;

export function validateSiteverifyResponse(
  responseOk: boolean,
  raw: unknown,
  config: RuntimeConfig,
): TurnstileResult {
  if (!responseOk) {
    throw new HttpError(502, 'turnstile_unavailable', 'Human verification is unavailable');
  }
  const parsed = SiteverifyResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(502, 'turnstile_unavailable', 'Human verification is unavailable');
  }
  if (!parsed.data.success) {
    const errorCodes = parsed.data['error-codes'] ?? [];
    if (
      errorCodes.length === 0 ||
      errorCodes.some((errorCode) => !PATIENT_TOKEN_ERROR_CODES.has(errorCode))
    ) {
      throw new HttpError(502, 'turnstile_unavailable', 'Human verification is unavailable');
    }
    throw new HttpError(403, 'turnstile_failed', 'Human verification failed');
  }
  if (config.ENVIRONMENT === 'staging' && config.TURNSTILE_SITE_KEY === ALWAYS_PASS_TEST_SITE_KEY) {
    return {
      success: true,
      hostname: config.TURNSTILE_EXPECTED_HOSTNAME,
      action: config.TURNSTILE_EXPECTED_ACTION,
    };
  }
  const hostname = parsed.data.hostname ?? '';
  const action = parsed.data.action ?? '';
  if (hostname !== config.TURNSTILE_EXPECTED_HOSTNAME || action !== config.TURNSTILE_EXPECTED_ACTION) {
    throw new HttpError(403, 'turnstile_context_mismatch', 'Human verification context mismatch');
  }
  return { success: true, hostname, action };
}

export const verifyTurnstile: TurnstileVerifier = async (token, request, config) => {
  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
      body: JSON.stringify({
        secret: config.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: request.headers.get('CF-Connecting-IP') ?? undefined,
        // Siteverify tokens are single-use. Reusing the form's UUID makes a
        // network retry idempotent without bypassing human verification.
        idempotency_key: requireIdempotencyKey(request),
      }),
    });
  } catch {
    throw new HttpError(502, 'turnstile_unavailable', 'Human verification is unavailable');
  }

  return validateSiteverifyResponse(response.ok, await response.json().catch(() => null), config);
};
