# ADR 0004: Isolate the synthetic full-arch demo catalog from clinical inference

- Status: accepted for pre-production testing
- Date: 2026-07-13

## Context

The funnel needs to create a lead and show an immediate useful range when a patient is interested in
a fixed solution for many missing teeth or a complete arch. The clinical item KB contains prices for
individual fixtures and restorations. Adding four or more fixture prices would omit the prosthetic
package and create a misleading total. A panoramic image also cannot establish full-arch eligibility.

The repository is a pre-production reference implementation and has no approved practice price list. Shipping
market observations would make the example look tied to a geography or provider and could anchor
patient expectations. The bundled range is therefore explicitly synthetic: it exists only to test
the deterministic full-arch branch, API contract, persistence and fail-closed production gate.

## Decision

Create a demo catalog that is separate from the clinical item KB and mark it
`synthetic_demo_catalog`. For the patient-declared `fixed_full_arch` goal:

- upper or lower target: EUR 2,700–4,000;
- both arches: EUR 5,400–8,000;
- calculate the total by deterministic multiplication of the per-arch range;
- do not invoke the vision mapper and do not create a synthetic `DentalAssessment`;
- do not require a radiograph for this branch; if one is optionally supplied for clinic follow-up,
  retain it only under the separate storage choice;
- persist `model`, prompt and tool metadata as `not_used`, and persist the commercial catalog
  version in the existing KB-version column;
- state that the range is synthetic demo data, not a market benchmark, clinic price list,
  diagnosis or confirmation of eligibility;
- keep extractions, grafting/sinus lift, sedation and prosthetic upgrades outside the assumed range
  until the clinic explicitly defines them.

Four-or-more ordinary implant fixture candidates remain blocked by the automatic-quote policy.
The commercial branch is triggered only by structured patient intent and target area, never inferred
from the radiograph.

## Replacement rule

The demo catalog is stored in one module and versioned independently. Before real-patient
production, the practice must replace it and approve gross/net status, VAT, inclusions, exclusions,
validity period, single/both-arch rules and translations. Replacing the demo catalog requires
updating the values, removing the synthetic status, incrementing its version, updating the API contract and rerunning
the full test/evaluation suite. The catalog remains technically disabled in production while its
status or tax terms are unapproved. Once production-ready, configuration must match a SHA-256
approval ID derived from the compiled prices and every translated term; a mismatch fails closed.
Existing encrypted results and idempotent replays are not recalculated.

## Consequences

- Full-arch leads receive an immediate range at zero model cost and low latency.
- The result is reproducible and cannot double-charge individual fixture lines.
- Demo values could anchor patient expectations incorrectly if exposed outside a controlled demo;
  UI copy, version metadata and the production gate make that limitation explicit.
- The radiograph can still be retained for later clinic follow-up only when separate storage consent
  is granted, but it is not used to justify the commercial range.
