# Threat model

- Scope: Cloudflare Worker v2 direct-estimate flow
- Reviewed: 2026-07-13
- Method: lightweight STRIDE-style asset and abuse-case review

## Assets and actors

Critical assets are patient identity/contact data, radiographs, derived health information, bearer
lead tokens, administrator credentials, encryption keys, provider API keys, the clinic price KB and
the integrity/availability of estimates. Actors include patients, clinic staff, opportunistic bots,
malicious submitters, an attacker with a stolen token, compromised dependencies/providers and an
operator with Cloudflare or secret access.

## Trust boundaries

The public browser-to-Worker boundary is untrusted. Cloudflare bindings are private application
boundaries but D1 and R2 are separate systems without cross-service transactions. The Anthropic API
is an external processor and data-transfer boundary. Admin routes add a Cloudflare Access identity
boundary in production. GitHub/CI is a software-supply-chain boundary and must never receive live
patient secrets or images.

## Threats, controls and residual risk

| Threat | Implemented control | Residual risk / next action |
|---|---|---|
| Automated cost exhaustion | Turnstile hostname/action check with bounded timeout and operational-error classification, native source plus separate phone/email rate limits, staging secret | Distributed valid-browser abuse remains; monitor spend/failure rate and add account budget alerts/WAF rules |
| Cross-origin browser submission | Exact origin allowlist and restrictive CORS response | CORS is a browser boundary, not bot authentication; non-browser clients still require Turnstile and rate limiting |
| Oversized or malformed image | Request/body caps, one JPEG/PNG, magic bytes, dimension checks, Cloudflare Images decode and canonical re-encode | Image decompression/runtime vulnerabilities remain provider/dependency risks |
| Prompt injection in text/image | Forced tool call, allowlisted KB IDs, Zod/KB validation, deterministic pricing, raw findings not returned | A valid-but-wrong treatment selection is still possible; red-team prompts and external eval are required |
| Model hallucination/overconfidence | Conservative prompt, poor/low-confidence abstention, mutually exclusive commercial-variant groups, no model arithmetic, non-binding output | Confidence is self-reported and not calibrated; validate abstention and interval coverage |
| Demo-price anchoring or stale catalog | Synthetic full-arch data isolated from the clinical KB, explicit demo status/version, per-arch deterministic multiplication and non-binding copy | Demo values must never be presented as market or clinic prices; clinic approval, validity dates and a replacement process are production gates |
| Full-arch double/incomplete charging | Four-plus ordinary fixture lines remain blocked; the demo scenario contains no component quote lines and never mixes with model candidates | Future catalog expansion must test package/component mutual exclusion and gross/net tax handling |
| IDOR / guessed lead ID | Random UUID plus a separate 256-bit bearer token; D1 stores its verification hash and an AES-GCM-encrypted copy only for idempotent recovery | Browser/idempotency-key storage, referrer or device compromise can expose access; frontend must keep both credentials out of URLs, analytics and logs |
| Admin credential theft | Long API secret; production also verifies Access JWT signature, issuer, audience and named identity | Access app/MFA and periodic access review are deployment gates; shared API key remains a second secret to rotate |
| Sensitive plaintext in D1/logs | AES-256-GCM with lead-bound AAD; request logs use an ephemeral correlation ID plus status, timing and error classes, not the persisted lead ID, contact data or model output | D1 plus encryption-key compromise reveals data; move key custody/rotation to an approved procedure and set an approved Workers-log retention period |
| Radiograph disclosure | Private R2 binding, opaque key, optional storage, audited admin download, no public bucket domain | Authorized admin can download; define least privilege and review audit logs |
| Orphaned R2 object / partial write | Optional R2 failure is fail-soft; R2 object is deleted if D1 insert fails; expiry cron and R2 lifecycle backstop | Cross-service delete is not atomic; reconciliation drills and alerts are still needed |
| Deleted data resurrected by restore | Active deletion removes D1/R2 and writes metadata-only audit | D1 Time Travel can restore older rows; restore runbook must replay suppression/deletion records |
| Duplicate lead / duplicate AI charge | Required idempotency key, unique D1 hash, normalized form/consent/processed-image fingerprint and encrypted recovery of the original access token | Intentionally ignored no-storage full-arch uploads do not change retry identity; a crash after lead creation leaves `received` until scheduled reconciliation; a durable job remains the stronger long-running design |
| Idempotency key reused across patients | Replay requires an exact encrypted-payload fingerprint match before the earlier lead/token is returned | A malicious client can still spend validation resources before the conflict is detected; source limits and Turnstile bound abuse |
| Supply-chain compromise | Lockfile, Dependabot, CI on Node 22/24, type checks, tests, Worker dry-run | Add dependency review and define a patch SLA |
| Dataset/license/privacy breach | Repository gate, CC BY-only public fixtures and machine-readable dataset registry | Every added image still needs provenance, de-identification, lawful-basis and redistribution review |

## Security invariants tested in CI

- Unknown treatment IDs proposed by the model are rejected before pricing; the uncertainty gate removes all candidates on poor or low-confidence input.
- Non-auto-quotable KB items (including extraction), more than 32 proposed units and aggregate
  duplicate overflow, or multiple alternatives from one commercial group cause a consultation-only
  abstention.
- Contact/result ciphertext is bound to the lead ID and legacy payloads remain readable.
- Idempotent retries recover the same lead/token without a second inference only when the normalized
  fields, consent context, storage choice and canonical image match; conflicting reuse returns `409`
  without a token.
- Disallowed origins and missing staging credentials fail before Turnstile/image persistence.
- Consent-copy hashes are checked against server configuration.
- Optional image storage can be withdrawn without deleting the estimate.
- Optional R2 failure preserves the lead with storage marked inactive.
- The expand-compatible D1 schema accepts the previous Worker during migration/upload; rollback
  after v2 traffic is not supported because the previous release cannot read v2 payloads/states.
- Expired lead data and R2 objects are removed at the request boundary and by scheduled maintenance.
- Direct results exclude the raw assessment and the removed approval route returns `404`.
- Full-arch intent produces only the versioned commercial range, does not invoke the mapper and
  cannot re-enable blocked four-plus-fixture item pricing.

## Deployment blockers

The detailed legal/privacy checklist is authoritative. At minimum: real domain/Turnstile, Access
with MFA, contracts/transfer assessment, DPIA, provider retention decision, intended-purpose/MDR
review, real consent/privacy copy, secret custody and incident/deletion/restore drills.
