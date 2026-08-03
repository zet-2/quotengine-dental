# ADR 0003: Separate inference consent from radiograph storage

- Status: accepted
- Date: 2026-07-13

## Context

A panoramic radiograph is health data. It must be processed to generate an estimate, but retaining
the original image is a separate purpose and creates additional exposure.

## Decision

Require explicit health-data processing consent for every submission and a separate optional,
unchecked storage choice. Always validate and canonicalize the image. Store it in private R2 only
when storage consent is granted; otherwise process it in memory. Encrypt contact, attribution,
assessment and estimate in D1. Expose token-authenticated storage withdrawal and lead deletion,
plus bounded retention and a lifecycle backstop.

## Consequences

- Refusing R2 storage does not prevent an estimate.
- Withdrawing storage deletes the image while retaining the requested lead/estimate.
- Canonicalization cannot remove identifiers burned into pixels.
- Provider-side inference retention and international transfers remain contractual/legal concerns,
  not problems solved by EU-jurisdiction D1/R2.
