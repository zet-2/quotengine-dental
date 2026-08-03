/**
 * Route-level tests for the quote HTTP app (no sockets — Hono app.request).
 * Verifies input validation, error mapping, and that internal error
 * details never leak to clients.
 */
import { describe, it, expect } from 'vitest';
import { createQuoteApp } from '../../src/api/createApp.js';
import { buildRegistry } from '../../src/clients/index.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import { MockIntakeMapper } from '../../src/intake/MockIntakeMapper.js';
import { createLogger } from '../../src/log.js';
import { rateLimit } from '../../src/http/rateLimit.js';

const silentLogger = createLogger('error', () => {});

function makeApp(overrides: Partial<Parameters<typeof createQuoteApp>[0]> = {}) {
  return createQuoteApp({
    clients: buildRegistry([dentalClinicKB]),
    mapperFactory: async () => new MockIntakeMapper(),
    logger: silentLogger,
    ...overrides,
  });
}

function postQuote(app: ReturnType<typeof createQuoteApp>, body: string): Promise<Response> {
  return app.request('/quote', {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createQuoteApp', () => {
  it('serves /health', async () => {
    const res = await makeApp().request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('generates a quote end-to-end with the mock mapper', async () => {
    const res = await postQuote(
      makeApp(),
      JSON.stringify({
        clientId: 'dental-clinic',
        language: 'en',
        freeText: '2 standard implants and a cleaning session',
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { quote: { total: number }; text: string };
    expect(body.quote.total).toBeGreaterThan(0);
    expect(body.text).toContain('QUOTE');
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await postQuote(makeApp(), '{not json');
    expect(res.status).toBe(400);
  });

  it('rejects a non-object body with 400', async () => {
    const res = await postQuote(makeApp(), '42');
    expect(res.status).toBe(400);
  });

  it('rejects a missing clientId with 400', async () => {
    const res = await postQuote(makeApp(), JSON.stringify({ freeText: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown client, listing available ones', async () => {
    const res = await postQuote(
      makeApp(),
      JSON.stringify({ clientId: 'nope', language: 'en', freeText: 'hi' }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('dental-clinic');
  });

  it('maps intake validation failures to 422', async () => {
    const res = await postQuote(
      makeApp(),
      JSON.stringify({ clientId: 'dental-clinic', language: 'en' }),
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid intake request/);
  });

  it('hides internal error details behind a generic 500', async () => {
    const app = makeApp({
      mapperFactory: async () => {
        throw new TypeError('boom-internal-secret');
      },
    });
    const res = await postQuote(
      app,
      JSON.stringify({ clientId: 'dental-clinic', language: 'en', freeText: 'hi' }),
    );
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('boom-internal-secret');
    expect(text).toContain('Internal server error');
  });

  it('honors injected middleware (rate limiting wired in)', async () => {
    const app = makeApp({
      middleware: [rateLimit({ max: 1, windowMs: 60_000 })],
    });
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/health')).status).toBe(429);
  });
});
