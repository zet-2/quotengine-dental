import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../src/worker/config.js';
import { validateSiteverifyResponse, verifyTurnstile } from '../../src/worker/turnstile.js';

describe('Turnstile response validation', () => {
  it('maps Cloudflare test-key responses to the expected staging context only', () => {
    const config = getRuntimeConfig(env);
    expect(validateSiteverifyResponse(true, { success: true, hostname: 'example.com' }, config))
      .toEqual({ success: true, hostname: 'localhost', action: 'dental_quote' });
  });

  it('fails closed when Siteverify does not succeed', () => {
    const config = getRuntimeConfig(env);
    expect(() => validateSiteverifyResponse(true, {
      success: false,
      'error-codes': ['invalid-input-response'],
    }, config))
      .toThrow('Human verification failed');
  });

  it('treats expired or duplicate patient tokens as verification failures', () => {
    const config = getRuntimeConfig(env);
    expect(() => validateSiteverifyResponse(true, {
      success: false,
      'error-codes': ['timeout-or-duplicate'],
    }, config)).toThrow('Human verification failed');
  });

  it.each([
    'missing-input-secret',
    'invalid-input-secret',
    'missing-input-response',
    'bad-request',
    'internal-error',
  ])('classifies Siteverify operational error %s as unavailable', (errorCode) => {
    const config = getRuntimeConfig(env);
    expect(() => validateSiteverifyResponse(true, {
      success: false,
      'error-codes': [errorCode],
    }, config)).toThrow('Human verification is unavailable');
  });

  it('classifies an unrecognized failure payload as unavailable', () => {
    const config = getRuntimeConfig(env);
    expect(() => validateSiteverifyResponse(true, { success: false }, config))
      .toThrow('Human verification is unavailable');
  });

  it('classifies a Siteverify HTTP failure as transient unavailability', () => {
    const config = getRuntimeConfig(env);
    expect(() => validateSiteverifyResponse(false, null, config))
      .toThrow('Human verification is unavailable');
  });

  it('reuses the submission UUID so Siteverify retries remain idempotent', async () => {
    const idempotencyKey = '019f592a-7ae5-4a31-a3bd-97aa733e06a5';
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const request = new Request('https://worker.test/api/leads', {
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    const config = getRuntimeConfig(env);

    await verifyTurnstile('single-use-token', request, config);
    await verifyTurnstile('single-use-token', request, config);

    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of fetch.mock.calls) {
      const body = JSON.parse(String(init?.body)) as { idempotency_key: string };
      expect(body.idempotency_key).toBe(idempotencyKey);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    fetch.mockRestore();
  });
});
