import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '../../src/worker/auth.js';
import { getRuntimeConfig, type RuntimeConfig } from '../../src/worker/config.js';

let keyPair: CryptoKeyPair;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function encodeJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function accessToken(payload: Record<string, unknown>): Promise<string> {
  const header = encodeJson({ alg: 'RS256', kid: 'test-key', typ: 'JWT' });
  const body = encodeJson(payload);
  const signed = new TextEncoder().encode(`${header}.${body}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, signed);
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

async function productionConfig(): Promise<RuntimeConfig> {
  return {
    ...getRuntimeConfig(env),
    ENVIRONMENT: 'production',
    ACCESS_AUD: 'access-audience',
    ACCESS_TEAM_DOMAIN: 'example-team.cloudflareaccess.com',
  };
}

describe('administrator authentication', () => {
  beforeAll(async () => {
    keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2_048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('requires a verified Cloudflare Access identity in production in addition to the API key', async () => {
    const config = await productionConfig();
    const request = new Request('https://api.example.com/api/admin/leads', {
      headers: { Authorization: `Bearer ${config.ADMIN_API_KEY}` },
    });

    await expect(requireAdmin(request, config)).rejects.toMatchObject({
      code: 'access_identity_required',
      status: 401,
    });
  });

  it('accepts a correctly signed Access JWT and returns its named identity', async () => {
    const config = await productionConfig();
    const now = Math.floor(Date.now() / 1_000);
    const token = await accessToken({
      iss: 'https://example-team.cloudflareaccess.com',
      aud: 'access-audience',
      iat: now - 1,
      exp: now + 60,
      email: 'dentist@example.com',
    });
    const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const request = new Request('https://api.example.com/api/admin/leads', {
      headers: {
        Authorization: `Bearer ${config.ADMIN_API_KEY}`,
        'Cf-Access-Jwt-Assertion': token,
      },
    });

    await expect(requireAdmin(request, config)).resolves.toBe('dentist@example.com');
  });

  it('rejects a signed Access JWT with the wrong audience', async () => {
    const config = await productionConfig();
    const now = Math.floor(Date.now() / 1_000);
    const token = await accessToken({
      iss: 'https://example-team.cloudflareaccess.com',
      aud: 'wrong-audience',
      iat: now - 1,
      exp: now + 60,
      email: 'dentist@example.com',
    });
    const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      keys: [{ ...publicKey, kid: 'test-key', alg: 'RS256', use: 'sig' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const request = new Request('https://api.example.com/api/admin/leads', {
      headers: {
        Authorization: `Bearer ${config.ADMIN_API_KEY}`,
        'Cf-Access-Jwt-Assertion': token,
      },
    });

    await expect(requireAdmin(request, config)).rejects.toMatchObject({
      code: 'invalid_access_identity',
      status: 401,
    });
  });
});
