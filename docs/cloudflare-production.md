# Cloudflare deployment runbook

The Cloudflare Worker is implemented, tested, and deliberately configured with production
placeholders. It is safe to use locally and in a synthetic-data staging environment. It must not
receive real patient radiographs until the privacy, validation and intended-purpose gates in
[privacy-go-live-checklist.md](./privacy-go-live-checklist.md) are complete.

## Architecture

The production entrypoint is `src/worker/index.ts`. It imports the dental knowledge base
statically and does not load Node.js filesystem, socket, `.env`, or process-level modules.

Submission flow:

1. Reject an unapproved browser origin, missing staging credential or oversized request.
2. Require a random UUID-v4 `Idempotency-Key`, apply the source rate limit, and reuse that UUID for
   the Turnstile Siteverify request.
3. Validate the Turnstile token server-side, including hostname and action, with a bounded timeout;
   expired/invalid patient tokens return `403`, while service/configuration failures return `502`.
4. Validate explicit health-data consent and the separate radiograph-storage choice.
5. On vision paths or when storage is requested, accept one JPEG/PNG no larger than 6 MiB, decode
   it with Cloudflare Images, validate dimensions, and re-encode it as a canonical JPEG so file
   metadata and trailing payloads are discarded. A file attached to `fixed_full_arch` with storage
   refused is ignored before decoding. Burned-in patient identifiers cannot be removed automatically.
6. Hash the normalized form, consent version/hashes/notice URL and any canonical image actually
   processed. Return an
   existing lead/token only when both the UUID and this encrypted-payload fingerprint match; reuse
   with different content returns `409`.
7. Apply Cloudflare-native submission limits separately to peppered phone and email identifiers.
8. Encrypt contact, structured intent, UTM attribution, message, assessment/commercial estimate and the retry-recoverable
   lead token with AES-256-GCM before
   writing them to D1.
9. Save the sanitized radiograph to private R2 only when the optional storage choice is `true`;
   an R2 failure keeps the lead and records storage as inactive.
10. For declared full-arch intent, resolve the synthetic demo catalog without an AI call.
    For other goals, keep the upload request open while generating the automatic estimate, with a
    45-second provider timeout and SDK retries disabled to bound latency/cost; the vision job is not
    delegated to `waitUntil()` because its post-response window is limited to 30 seconds.
11. Return `201` with either the patient-facing, constrained `estimate_ready` result or a
   `follow_up_required` fallback. Low-confidence/poor images succeed as `consultationOnly` without
   a guessed number. The lead is already saved if inference fails.
12. Let the patient token retrieve the persisted result, withdraw only optional R2 storage, or
    delete both active D1/R2 data.

R2 and D1 are separate systems, so cross-service writes cannot be atomic. The Worker deletes a
new R2 object if its D1 insert fails. The hourly cron reconciles interrupted `received` jobs and
removes expired D1 rows/R2 objects in bounded batches; an R2 lifecycle rule is the independent
final safeguard.

An erasure request removes the active D1 row and R2 object immediately from the application. It
does not promise instant physical erasure from every resilience copy: D1 Time Travel is always on
and retains restore points for 7 days on Free or 30 days on paid plans. R2 lifecycle expiration is
asynchronous and may take about 24 hours. These residual periods must appear in the retention and
erasure procedure.

## API contract

All API responses use `Cache-Control: no-store, private`.

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Runtime configuration health check |
| `GET` | `/api/config` | Public consent, upload, and Turnstile configuration |
| `POST` | `/api/leads` | Create a lead and return an immediate indicative estimate or follow-up fallback |
| `GET` | `/api/leads/:id/status` | Patient status and persisted patient-facing result when ready |
| `DELETE` | `/api/leads/:id/radiograph` | Withdraw optional storage and remove only the R2 image |
| `DELETE` | `/api/leads/:id` | Remove the active D1/R2 record using the lead token or protected admin access |
| `GET` | `/api/admin/leads` | Protected, paginated lead list with name/phone/email/preference |
| `GET` | `/api/admin/leads/:id` | Protected lead, attribution, estimate and version metadata |
| `GET` | `/api/admin/leads/:id/radiograph` | Stream a private R2 object |

`POST /api/leads` requires:

- header `X-Staging-Key` in staging (never used as the production patient control);
- header `Idempotency-Key`, generated once per form attempt and reused only for retries;
- header `X-Turnstile-Token`;
- multipart fields `fullName`, `phone`, `email`, `contactPreference`, optional `message`, and
  `language`; new clients also send `treatmentGoal` and `targetArea` (legacy omissions safely
  default to `unsure` and `both`);
- optional attribution fields `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`,
  and relative `landingPath`;
- `healthDataConsent=true`;
- `radiographStorageConsent=true|false` as an explicit choice;
- the current `consentVersion`, localized `consentTextSha256`, and localized
  `privacyNoticeSha256` returned by `/api/config`;
- one `image` file for vision paths; it is optional for `fixed_full_arch` when storage consent is
  `false`, because the demo range does not use the image.

The returned `leadAccessToken` must remain private; it authorizes status reads and deletion for
that lead. It is stored only inside the encrypted D1 payload so an idempotent retry can recover the
same token. A completed replay returns `200`; a concurrent in-flight replay returns `202` and can
poll the status route; a newly completed submission returns `201`. Reusing the same key with any
different normalized field, storage choice or image processed for inference/storage returns `409`
and never exposes the earlier lead token. An image attached to `fixed_full_arch` while storage is
refused is deliberately discarded and therefore does not affect retry identity.

The machine-readable contract is [`../openapi/quotengine.openapi.json`](../openapi/quotengine.openapi.json).
The API intentionally returns the estimate in the creation response; the site can render it before
moving to WhatsApp/call/email follow-up.

`fixed_full_arch` uses the selected `upper`, `lower` or `both` target only as a demo scenario.
It returns the catalog's synthetic per-arch/total range, stores `not_used` model metadata and never
infers clinical eligibility from the image. Production remains blocked until the clinic replaces
the synthetic demo data with a production-ready catalog, including confirmed VAT,
inclusions, exclusions and validity. The exact approval is recorded in
`COMMERCIAL_CATALOG_APPROVED_ID`; production validation requires it to equal a SHA-256 identifier
bound to the prices and every translated term compiled into the Worker. Both deployment validators
recompute that identifier before Wrangler can migrate or deploy anything.

`CONSENT_TEXT_SHA256` and `PRIVACY_NOTICE_SHA256` are per-language SHA-256 digests of the exact copy
presented by the website. The Worker returns them from `/api/config`, requires the browser to echo
the selected-language values, rejects stale/mismatched copy, and stores the server-controlled
values with the capture timestamp.

Admin routes require both `Authorization: Bearer <ADMIN_API_KEY>` and, in production, a valid
`Cf-Access-Jwt-Assertion`. The Worker verifies its signature, issuer, audience and expiry against
the configured Cloudflare Access JWKS, then records the named identity in the durable audit log.
The Access application/policy and MFA still have to be created in the account.

## Local development

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run worker:types
npx wrangler d1 migrations apply LEADS_DB --local
npm run worker:dev
```

Use only synthetic/de-identified test images locally. Cloudflare's documented Turnstile test
sitekey is configured for staging; `.dev.vars` must contain the matching test secret.

Verification commands:

```bash
npm run typecheck
npm test
npm run worker:test:types
npm run worker:test
npm run worker:types:check
npm run catalog:validate
npm run worker:validate:staging
npm run worker:dry-run
npm run worker:dry-run:production
```

## Example staging and production resources

The resource names, UUIDs and rate-limit namespace IDs committed in `wrangler.jsonc` are non-secret
examples. Before any remote migration or deployment, create separate D1 and R2 resources in your
own account, replace each example `database_name`, `database_id` and `bucket_name`, and choose
rate-limit `namespace_id` values that are unique within that account. Choose the required
jurisdiction at resource creation and keep `jurisdiction: "eu"` on both R2 bindings when deploying
in the EU.

Apply schema migrations:

```bash
npx wrangler d1 migrations apply LEADS_DB --remote --env=""
npx wrangler d1 migrations apply LEADS_DB --remote --env production
```

Migration `0004` is expand-compatible: its temporary status union and metadata defaults let the
previous Worker continue writing while the new upload completes, including when the upload fails
before v2 serves traffic. It does **not** make a rollback safe after v2 has written new ciphertext,
payloads or states; use a forward fix or a specifically compatibility-tested release. A future
contract migration may remove the legacy states only after the old Worker can no longer run.

Create and verify the 30-day `radiograph-retention` lifecycle safeguard on both deployment buckets:

```bash
npx wrangler r2 bucket lifecycle add YOUR_STAGING_R2_BUCKET radiograph-retention radiographs/ --expire-days 30 --jurisdiction eu --force
npx wrangler r2 bucket lifecycle add YOUR_PRODUCTION_R2_BUCKET radiograph-retention radiographs/ --expire-days 30 --jurisdiction eu --force
```

If `DATA_RETENTION_DAYS` changes, update both lifecycle rules at the same time.

## Secrets

Set every secret interactively; never put values in `wrangler.jsonc`, shell history, GitHub YAML,
or chat logs:

```bash
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put DATA_ENCRYPTION_KEY
npx wrangler secret put STAGING_API_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY

npx wrangler secret put ADMIN_API_KEY --env production
npx wrangler secret put ANTHROPIC_API_KEY --env production
npx wrangler secret put DATA_ENCRYPTION_KEY --env production
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
```

`ADMIN_API_KEY` must have at least 32 random characters. `DATA_ENCRYPTION_KEY` must be exactly 32
random bytes encoded as base64. Keep a recoverable copy in the organization's password/key
manager: losing it makes every encrypted D1 payload unreadable. Key rotation needs a planned data
migration; changing the value in place is destructive.

`STAGING_API_KEY` prevents the public `workers.dev` staging endpoint and its always-pass Turnstile
widget from becoming an open Anthropic cost/data-ingestion endpoint. It is checked before image
processing and must be supplied only to authorized testers. Do not embed it in a publicly served
frontend.

## Turnstile and domain placeholders

The real route and widget cannot be created until the standalone product's production hostname
exists. When it does:

1. Add a production `route`/`routes` custom domain entry to `wrangler.jsonc`; the deployment gate
   rejects production without one.
2. Create separate staging and production widgets restricted to their exact hostnames.
3. Use action `dental_quote`.
4. Replace `TURNSTILE_SITE_KEY`, `TURNSTILE_EXPECTED_HOSTNAME`, `ALLOWED_ORIGINS`,
   `PRIVACY_NOTICE_URL`, `CONSENT_VERSION`, all localized copy hashes, `ACCESS_TEAM_DOMAIN`, and
   `ACCESS_AUD` in `wrangler.jsonc`. Set `COMMERCIAL_CATALOG_APPROVED_ID` only after the synthetic
   demo catalog has been replaced, marked production-ready and approved with confirmed tax and terms.
5. Set the corresponding widget secret with `wrangler secret put`.
6. Validate a real browser submission. The Worker verifies Siteverify itself; the browser must not
   treat client-side widget success as authorization.

`npm run worker:deploy:production` first runs a static configuration gate; production runtime
validation fails closed as a second line of defence. Both reject placeholders/local hosts, invalid
copy hashes, the Turnstile always-pass test key, a catalog that remains demo-only, or content whose
approval ID does not match the compiled prices and terms.

## Deployment order

1. Close the privacy, contractual, DPIA, validation/intended-purpose, and medical-device gates.
2. Provision and verify the deployment-specific EU resources and lifecycle rules.
3. Apply migrations and secrets.
4. Deploy staging: `npm run worker:deploy:staging` (the command rechecks and applies pending D1
   migrations before uploading the Worker).
5. Test with synthetic data; inspect logs and exercise immediate result, constrained abstention,
   idempotent retry, provider-failure fallback, R2 fail-soft behavior, status, storage withdrawal
   and deletion.
6. Create Cloudflare Access/MFA, set its team domain and application audience, and test a named
   clinic identity.
7. Run `npm run worker:dry-run:production`.
8. Deploy production: `npm run worker:deploy:production`.

Do not attach a public R2 development domain or custom domain to the radiograph buckets.

References: [Cloudflare Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/),
[Workers execution context](https://developers.cloudflare.com/workers/runtime-apis/context/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), and
[R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
