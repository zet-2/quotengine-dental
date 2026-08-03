# Changelog

All notable product and contract changes are recorded here. Dates use ISO 8601.

## Unreleased

### Changed

- Rename the example dental client and its external ID to `dental-clinic` across the runtime,
  public contract, documentation and tests.
- Deliver constrained patient-facing indicative dental estimates directly in `POST /api/leads`.
- Replace the clinician-approval state machine with `received`, `estimate_ready` and
  `processing_failed`.
- Split funnel contact into phone/email/preference and capture bounded UTM attribution.
- Rename the model signal to `requiresClinicalConfirmation` and expose the patient-facing
  `requiresInPersonConfirmation` field.
- Require a declared treatment goal in the local vision demo and keep raw model observations out
  of every patient-facing renderer through a shared typed projection.
- Localize free-text model output to the patient's selected language and version the prompt change.
- Keep blocking four-or-more individual implant fixtures so an incomplete component sum cannot be
  presented as a full-arch package.
- Route patient-declared full-arch intent to a separate, versioned synthetic demo catalog,
  returning a deterministic example range without invoking the vision model.
- Remove internal client, item and modifier identifiers from the public quote projection.
- Publish the patient-facing contract as API `4.0.0`; preserve older funnel submissions with
  `unsure`/`both` defaults and a legacy idempotency fingerprint.
- Make the radiograph optional for the full-arch commercial path and scope vision candidates
  deterministically to the patient-selected arch.

### Added

- Release project-authored source code and documentation under the MIT License, with
  third-party evaluation assets retaining their original terms.
- Expand-compatible D1 migrations for direct estimates, idempotency and per-lead
  model/prompt/tool/KB version metadata.
- Backward-compatible decryption for version 1 encrypted lead payloads.
- OpenAPI 3.1 contract, ADRs, architecture, model card, threat model and dataset registry.
- Direct-result, constrained-abstention, provider-failure, funnel-validation and contract tests.
- Required idempotent retries, separate phone/email rate-limit keys and fail-soft optional R2
  persistence.
- A deterministic automatic-quote policy that excludes non-clinical items and bounds aggregate
  quantities and implant ranges, with mutually exclusive material/system variants.
- Content-bound idempotency fingerprints, a bounded Turnstile Siteverify request and detailed
  item/price label coverage in the evaluation report.
- Structured treatment-goal/target-area capture and a reproducible demo-scenario result with
  explicit synthetic status, per-arch unit/total ranges, assumptions, exclusions, tax status and
  validity status.
- A production-readiness gate and SHA-256 approval ID bound to the exact commercial-catalog prices
  and translated terms.

### Removed

- Keep the shipped example catalog and services focused on configurable dental practices.
- Remove evaluation radiographs with unresolved provenance or restrictive reuse terms from the
  public snapshot.
- Admin approve/reject endpoints and pre-delivery clinical-review workflow.

## 1.0.0 - 2026-07-13

- Deterministic config-driven quote core and dental vision mapper.
- Cloudflare Worker with D1/R2, Turnstile, encryption, Access-protected administration, audit,
  consent controls, deletion and scheduled retention.
