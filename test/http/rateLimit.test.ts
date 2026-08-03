/**
 * Tests for the fixed-window in-memory rate limiter middleware.
 */
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { rateLimit, REMOTE_ADDR_HEADER } from '../../src/http/rateLimit.js';

function makeApp(max: number, windowMs: number, now: () => number): Hono {
  const app = new Hono();
  app.use('*', rateLimit({ max, windowMs, now }));
  app.get('/ping', (c) => c.json({ ok: true }));
  return app;
}

function get(app: Hono, addr = '10.0.0.1'): Promise<Response> {
  return app.request('/ping', { headers: { [REMOTE_ADDR_HEADER]: addr } });
}

describe('rateLimit', () => {
  it('allows up to max requests per window, then returns 429 with Retry-After', async () => {
    let t = 1_000_000;
    const app = makeApp(2, 60_000, () => t);

    expect((await get(app)).status).toBe(200);
    expect((await get(app)).status).toBe(200);

    const limited = await get(app);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    const body = (await limited.json()) as { error: string };
    expect(body.error).toMatch(/too many requests/i);
  });

  it('resets the counter when the window rolls over', async () => {
    let t = 1_000_000;
    const app = makeApp(1, 60_000, () => t);

    expect((await get(app)).status).toBe(200);
    expect((await get(app)).status).toBe(429);

    t += 60_001;
    expect((await get(app)).status).toBe(200);
  });

  it('tracks clients independently by remote address', async () => {
    let t = 1_000_000;
    const app = makeApp(1, 60_000, () => t);

    expect((await get(app, '10.0.0.1')).status).toBe(200);
    expect((await get(app, '10.0.0.2')).status).toBe(200);
    expect((await get(app, '10.0.0.1')).status).toBe(429);
  });

  it('limits requests lacking a remote address under a shared key', async () => {
    let t = 1_000_000;
    const app = makeApp(1, 60_000, () => t);

    expect((await app.request('/ping')).status).toBe(200);
    expect((await app.request('/ping')).status).toBe(429);
  });
});
