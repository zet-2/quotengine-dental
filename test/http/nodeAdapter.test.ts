/**
 * Integration tests for the Node → fetch adapter: real HTTP server on an
 * ephemeral port, real requests. Covers body-size caps and the
 * spoof-proof remote-address header.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { nodeAdapter } from '../../src/http/nodeAdapter.js';
import { REMOTE_ADDR_HEADER } from '../../src/http/rateLimit.js';

const servers: http.Server[] = [];

function listen(handler: (req: Request) => Response | Promise<Response>, maxBodyBytes?: number): Promise<string> {
  const server = http.createServer(
    nodeAdapter(handler, maxBodyBytes === undefined ? {} : { maxBodyBytes }),
  );
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
});

describe('nodeAdapter', () => {
  it('round-trips method, body, and status', async () => {
    const base = await listen(async (req) => {
      const text = await req.text();
      return new Response(JSON.stringify({ method: req.method, echoed: text }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });

    const res = await fetch(`${base}/anywhere`, { method: 'POST', body: 'hello' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ method: 'POST', echoed: 'hello' });
  });

  it('rejects bodies over the cap with 413 without invoking the handler', async () => {
    let handlerCalled = false;
    const base = await listen(() => {
      handlerCalled = true;
      return new Response('ok');
    }, 1024);

    const res = await fetch(`${base}/upload`, {
      method: 'POST',
      body: 'x'.repeat(10_000),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/too large/i);
    expect(handlerCalled).toBe(false);
  });

  it('overwrites any client-supplied remote-address header with the socket address', async () => {
    const base = await listen((req) =>
      new Response(JSON.stringify({ addr: req.headers.get(REMOTE_ADDR_HEADER) }), {
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await fetch(base, { headers: { [REMOTE_ADDR_HEADER]: '203.0.113.66' } });
    const { addr } = (await res.json()) as { addr: string };
    expect(addr).not.toBe('203.0.113.66');
    expect(addr).toMatch(/127\.0\.0\.1/);
  });

  it('returns 500 with a generic body when the handler throws', async () => {
    const base = await listen(() => {
      throw new Error('internal details that must not leak');
    });

    const res = await fetch(base);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('internal details');
  });
});
