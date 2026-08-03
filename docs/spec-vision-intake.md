# quotengine — Vision Intake (Dental X-ray → Quote) Spec

**Status:** historical design record; implemented and amended by ADR 0002 on 2026-07-13
**Extends:** [docs/spec.md](./spec.md)

## Goal
Let the **dental-clinic** client generate an **indicative** quote from patient-submitted
**images** (intraoral photos + panoramic x-ray) plus free text — *without changing the shared
quoting core*. The output is an automatic **non-diagnostic, non-binding** price estimate delivered
immediately to convert prospective patients into booked consultations. It is not pre-approved by a
dentist and always requires in-person clinical confirmation.

## Hard rules (in addition to the core rule: *the LLM never does arithmetic*)
1. **Not a diagnosis.** The model extracts coarse, conservative treatment *signals*, never a
   clinical diagnosis. Output is always flagged `requiresClinicalConfirmation`.
2. **No invented treatments.** Candidate treatments must map to `itemId`s that exist in the
   dental KB (reuse `validateAssessmentAgainstKB`).
3. **Deterministic pricing unchanged.** Extraction → existing `MappedIntake` →
   existing `PricingEngine.compute()` → existing `QuoteFormatter`. Zero edits to
   pricing / rules / formatter / KB.
4. **Conservative on uncertainty.** Poor image quality or low confidence → a successful
   `consultationOnly` response with no numerical quote, not a guess.

## Additive design (no split, no core changes)
- **Domain (additive):** `IntakeImage { kind: 'photo' | 'panoramic_xray' | 'document', mediaType, data (base64) }`;
  optional `images?: readonly IntakeImage[]` on `IntakeRequest`. Text-only dental intake remains
  available — `images` is optional and ignored outside the guarded vision flow.
- **New `src/dental/` module:**
  - `types.ts` — `DentalAssessment` (archFindings, candidateTreatments→KB itemIds,
    imageQuality, overallConfidence, `requiresClinicalConfirmation`).
  - `schemas.ts` — zod for the assessment + the model tool output.
  - `assessmentToMappedIntake.ts` — **pure** converter: assessment → existing `MappedIntake`.
  - `DentalVisionMapper.ts` — interface `assess(request, kb): Promise<DentalAssessment>`.
  - `MockDentalVisionMapper.ts` — offline fixtures (no API key; drives tests + CLI demo).
  - `ClaudeDentalVisionMapper.ts` — Claude multimodal + tool-use; conservative prompt;
    validates IDs vs KB.
  - `generateDentalQuote.ts` — pipeline: assess → convert → `compute()` → format →
    attach assessment + non-diagnostic disclaimer (it/sq/en).
- **Eval:** `src/eval/cli.ts` + `npm run eval:dental -- --cases <dir>`: coarse agreement
  (arch-level treatment type + implant-count bucket) vs known cases. **Go/no-go before
  promising it to a clinic.**

## GDPR / safety (Cloudflare application layer)
Images are special-category health data under GDPR and applicable national law. The Cloudflare Worker adds
explicit granular consent, optional private R2 persistence, encrypted D1 payloads, authenticated
deletion, retention enforcement, direct-estimate/failure states and protected clinic follow-up.
Legal/organizational gates and
the deployment runbook live in `docs/privacy-go-live-checklist.md` and
`docs/cloudflare-production.md`. Real-patient production remains blocked until those gates close.

## Acceptance (TDD — tests first)
- [x] `IntakeImage` / `images` schema validates; existing `IntakeRequest` tests remain green (images optional).
- [x] `assessmentToMappedIntake` is pure and unit-tested, including empty and duplicate cases.
- [x] `MockDentalVisionMapper` drives full `generateDentalQuote` for dental-clinic with **no API key**.
- [x] Candidate treatments not in the KB are rejected before pricing.
- [x] Low confidence / poor image → `requiresClinicalConfirmation=true` and consultation-only with no number.
- [x] Disclaimers render in it / sq / en.
- [x] `ClaudeDentalVisionMapper` output is Zod- and KB-validated; malformed output fails closed.
- [x] `tsc --noEmit`, Vitest and coverage gates pass; the pricing core remains deterministic.

## Out of scope (YAGNI)
WhatsApp wiring, DICOM parsing (accept JPEG/PNG of the panoramic), real CBCT analysis, autonomous
treatment planning, and the future patient-facing website.
