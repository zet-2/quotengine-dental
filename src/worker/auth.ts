import { verifyWithJwks } from 'hono/jwt';
import type { RuntimeConfig } from './config.js';
import { sha256Hex, timingSafeSecretEqual } from './crypto.js';
import { HttpError } from './errors.js';

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

export async function requireStagingAccess(
  request: Request,
  config: RuntimeConfig,
): Promise<void> {
  if (config.ENVIRONMENT !== 'staging') return;
  const token = request.headers.get('X-Staging-Key') ?? '';
  if (!config.STAGING_API_KEY || !(await timingSafeSecretEqual(token, config.STAGING_API_KEY))) {
    throw new HttpError(401, 'staging_access_required', 'Valid staging credentials are required');
  }
}

async function requireAccessIdentity(request: Request, config: RuntimeConfig): Promise<string> {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!assertion) {
    throw new HttpError(401, 'access_identity_required', 'A valid administrator identity is required');
  }

  try {
    const issuer = `https://${config.ACCESS_TEAM_DOMAIN}`;
    const payload = await verifyWithJwks(assertion, {
      jwks_uri: `${issuer}/cdn-cgi/access/certs`,
      verification: { aud: config.ACCESS_AUD, iss: issuer },
      allowedAlgorithms: ['RS256'],
    }, { cf: { cacheEverything: true, cacheTtl: 300 } });
    const email = payload['email'];
    if (typeof email !== 'string' || email.length < 3 || email.length > 200) throw new Error();
    return email;
  } catch {
    throw new HttpError(401, 'invalid_access_identity', 'A valid administrator identity is required');
  }
}

export async function requireAdmin(request: Request, config: RuntimeConfig): Promise<string> {
  const token = bearerToken(request);
  if (!token || !(await timingSafeSecretEqual(token, config.ADMIN_API_KEY))) {
    throw new HttpError(401, 'unauthorized', 'Valid administrator credentials are required');
  }
  return config.ENVIRONMENT === 'production'
    ? requireAccessIdentity(request, config)
    : 'shared-admin-key';
}

export async function requireLeadAccess(
  request: Request,
  deletionTokenHash: string,
  config: RuntimeConfig,
): Promise<'lead-token' | string> {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'unauthorized', 'A valid access token is required');

  const isAdmin = await timingSafeSecretEqual(token, config.ADMIN_API_KEY);
  const providedHash = await sha256Hex(token);
  const isLeadToken = await timingSafeSecretEqual(providedHash, deletionTokenHash);
  if (!isAdmin && !isLeadToken) {
    throw new HttpError(401, 'unauthorized', 'A valid access token is required');
  }
  if (isLeadToken) return 'lead-token';
  return config.ENVIRONMENT === 'production'
    ? requireAccessIdentity(request, config)
    : 'shared-admin-key';
}
