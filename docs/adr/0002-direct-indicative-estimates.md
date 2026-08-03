# ADR 0002: Deliver indicative estimates without pre-delivery clinical review

- Status: accepted
- Date: 2026-07-13

## Context

The product's primary job is to turn anonymous website traffic into a qualified dental clinic
lead. Waiting for a dentist before showing any output removes the immediacy that makes the funnel
useful.

## Decision

Persist the contact first, run one bounded multimodal assessment inline and return the result in the
same `POST /api/leads` response. The output is explicitly automatic, non-diagnostic, non-binding
and subject to in-person confirmation. Poor image quality or low confidence produces a successful
`consultationOnly` abstention rather than a guessed price. Provider failure preserves the lead as
`processing_failed` and asks for follow-up.

## Consequences

- No human approval endpoint or `approved` status exists in the v2 runtime.
- The product gains immediate conversion value but assumes higher validation and intended-purpose
  risk than a clinician-gated draft workflow.
- The clinic still performs the later consultation and can contact every captured lead.
- Required idempotency keys prevent browser retries from duplicating the lead or inference charge;
  a normalized form/consent/image fingerprint rejects accidental reuse for another patient before
  the earlier token can be returned. Durable background execution remains a reliability follow-up
  for crash recovery.
