import { readFileSync } from 'node:fs';

const environment = process.argv[2];
if (environment !== 'staging' && environment !== 'production') {
  throw new Error('Usage: node scripts/validate-worker-config.mjs <staging|production>');
}

const root = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
const catalogSource = readFileSync(
  new URL('../src/dental/commercialCatalog.ts', import.meta.url),
  'utf8',
);
const catalogVersion = catalogSource.match(
  /COMMERCIAL_CATALOG_VERSION\s*=\s*['"]([^'"]+)['"]/,
)?.[1];
if (!catalogVersion) throw new Error('Could not read COMMERCIAL_CATALOG_VERSION');
const catalogApprovalId = catalogSource.match(
  /COMMERCIAL_CATALOG_APPROVAL_ID\s*=\s*(?:\r?\n\s*)?['"]([^'"]+)['"]/,
)?.[1];
if (!catalogApprovalId) throw new Error('Could not read COMMERCIAL_CATALOG_APPROVAL_ID');
const catalogProductionReady = catalogSource.match(
  /COMMERCIAL_CATALOG_PRODUCTION_READY\s*=\s*(true|false)/,
)?.[1] === 'true';
const config = environment === 'production'
  ? { ...root, ...root.env?.production }
  : root;
const vars = config.vars ?? {};
const errors = [];
const placeholder = /replace-me|\.invalid|localhost|127\.0\.0\.1/i;
const hash = /^[a-f0-9]{64}$/i;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function requireValue(name, value) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${name} is missing`);
}

for (const name of [
  'ACCESS_AUD',
  'ACCESS_TEAM_DOMAIN',
  'ALLOWED_ORIGINS',
  'COMMERCIAL_CATALOG_APPROVED_ID',
  'CONSENT_VERSION',
  'PRIVACY_NOTICE_URL',
  'TURNSTILE_EXPECTED_HOSTNAME',
  'TURNSTILE_SITE_KEY',
]) requireValue(name, vars[name]);

for (const [group, values] of [
  ['CONSENT_TEXT_SHA256', vars.CONSENT_TEXT_SHA256],
  ['PRIVACY_NOTICE_SHA256', vars.PRIVACY_NOTICE_SHA256],
]) {
  for (const language of ['it', 'sq', 'en']) {
    if (!hash.test(values?.[language] ?? '')) errors.push(`${group}.${language} must be a SHA-256 hex digest`);
  }
}

const database = config.d1_databases?.find((entry) => entry.binding === 'LEADS_DB');
if (!database || !uuid.test(database.database_id ?? '')) {
  errors.push('LEADS_DB must have a valid UUID-shaped database_id');
}
const bucket = config.r2_buckets?.find((entry) => entry.binding === 'RADIOGRAPHS');
if (!bucket?.bucket_name || bucket.jurisdiction !== 'eu') errors.push('RADIOGRAPHS must use an EU-jurisdiction bucket');
if (!config.images || config.images.binding !== 'IMAGES') errors.push('IMAGES binding is missing');

const requiredSecrets = new Set(config.secrets?.required ?? []);
for (const secret of [
  'ADMIN_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATA_ENCRYPTION_KEY',
  'TURNSTILE_SECRET_KEY',
]) {
  if (!requiredSecrets.has(secret)) errors.push(`${secret} is not declared as required`);
}
if (environment === 'staging' && !requiredSecrets.has('STAGING_API_KEY')) {
  errors.push('STAGING_API_KEY is not declared as required');
}

if (environment === 'production') {
  const publicValues = [
    vars.ACCESS_AUD,
    vars.ACCESS_TEAM_DOMAIN,
    vars.ALLOWED_ORIGINS,
    vars.COMMERCIAL_CATALOG_APPROVED_ID,
    vars.CONSENT_VERSION,
    vars.PRIVACY_NOTICE_URL,
    vars.TURNSTILE_EXPECTED_HOSTNAME,
    vars.TURNSTILE_SITE_KEY,
    ...Object.values(vars.CONSENT_TEXT_SHA256 ?? {}),
    ...Object.values(vars.PRIVACY_NOTICE_SHA256 ?? {}),
    JSON.stringify(config.route ?? config.routes ?? ''),
  ];
  if (publicValues.some((value) => placeholder.test(String(value)))) {
    errors.push('production public configuration contains placeholders or local values');
  }
  if (vars.TURNSTILE_SITE_KEY === '1x00000000000000000000AA') {
    errors.push('production cannot use the Turnstile always-pass test site key');
  }
  if (!catalogProductionReady) {
    errors.push(
      `commercial catalog ${catalogVersion} is synthetic demo data or has unconfirmed tax/terms`,
    );
  }
  if (vars.COMMERCIAL_CATALOG_APPROVED_ID !== catalogApprovalId) {
    errors.push(
      `production must explicitly approve commercial catalog content ${catalogApprovalId}`,
    );
  }
  if (!String(vars.ACCESS_TEAM_DOMAIN).endsWith('.cloudflareaccess.com')) {
    errors.push('ACCESS_TEAM_DOMAIN must be a Cloudflare Access team domain');
  }
  for (const origin of String(vars.ALLOWED_ORIGINS).split(',')) {
    try {
      const url = new URL(origin.trim());
      if (url.protocol !== 'https:' || url.origin !== origin.trim()) throw new Error();
    } catch {
      errors.push(`invalid production origin: ${origin}`);
    }
  }
  if (config.workers_dev !== false || config.preview_urls !== false) {
    errors.push('production workers_dev and preview_urls must both be false');
  }
  const hasRoute = typeof config.route === 'string'
    ? config.route.trim() !== ''
    : (typeof config.route === 'object' && config.route !== null)
      || (Array.isArray(config.routes) && config.routes.length > 0);
  if (!hasRoute) errors.push('production must define a custom route or custom domain');
}

if (errors.length > 0) {
  throw new Error(`Invalid ${environment} Worker configuration:\n- ${errors.join('\n- ')}`);
}

console.log(`${environment} Worker configuration is structurally valid`);
