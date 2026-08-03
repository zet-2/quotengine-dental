# quotengine — Configurable Dental Estimate Engine

**Status:** historical design record; implemented (the later direct dental flow is governed by ADR 0002)
**Date:** 2026-05-25

## Purpose
A configurable dental estimate engine: one guarded core, configured per practice. A patient or
staff member enters a treatment request; the agent maps it to allowed items from that practice's
catalog, a **deterministic calculator** computes the totals, and the system returns a multilingual,
non-binding estimate.

The repository ships with one synthetic `dental-clinic` catalog. It demonstrates per-practice
configuration without representing a real clinic, geography or price list.

## Hard rule: the LLM never does arithmetic
The model only **maps language → structured selections** (which items, quantities, modifiers). **All math is deterministic TypeScript.** This is what keeps quotes accurate and trustworthy; it is the core design constraint.

## Stack
- TypeScript (ESM, strict), Node 22+
- `@anthropic-ai/sdk` for intake mapping (model `claude-sonnet-4-6`, **prompt caching** on the KB/system portion, **tool use / structured output** for the line-item selection)
- `zod` for all config + intake + model-output validation
- `vitest` for tests, `tsx` to run, `typescript`
- Optional thin HTTP via `hono`; a CLI demo via `tsx`. The reusable pricing core needs no DB.
  The additive dental production Worker uses Cloudflare D1 and private R2 for consented lead data.

## File structure (many small files; ≤400 lines each)
```
quotengine/
  src/
    domain/
      types.ts          # ServiceItem, PricingRule, Modifier, KnowledgeBase, IntakeRequest, LineItem, Quote, Language
      schemas.ts        # zod schemas for KnowledgeBase + IntakeRequest + model output
    kb/
      KnowledgeBase.ts   # load + validate a client KB
    intake/
      IntakeMapper.ts    # interface: map(request, kb, lang) -> selected line items
      ClaudeIntakeMapper.ts
      MockIntakeMapper.ts
    pricing/
      PricingEngine.ts   # PURE deterministic: items + rules + modifiers -> Quote (subtotal, labor, fees, markup, tax, total)
      rules.ts           # rule/modifier application helpers (pure)
    format/
      QuoteFormatter.ts  # render Quote as text in it/sq/en + structured JSON
    clients/
      dental-clinic.ts   # synthetic example practice catalog
    api/
      generateQuote.ts   # orchestrates: intake.map -> pricing.compute -> format
    cli.ts               # `npm run quote -- --client dental-clinic` interactive demo
    server.ts            # optional hono: POST /quote
    env.ts               # zod-validated env; real vs mock mapper selection
  test/                  # vitest specs mirroring src/
  .env.example
  README.md
  package.json tsconfig.json vitest.config.ts
```

## Domain (immutable, zod-validated)
- `Language = 'it' | 'sq' | 'en'`
- `ServiceItem`: id, name (per-language labels), unit, unitPrice, optional laborHours, category
- `PricingRule`: versioned deterministic pricing inputs such as labor rate or minimum charge
- `Modifier`: percentage or flat adjustments (e.g. urgency surcharge, multi-unit discount), with conditions
- `KnowledgeBase`: clientName, languages, currency, items[], rules, modifiers[], markupPercent, taxPercent
- `IntakeRequest`: clientId, language, freeText (and/or structured fields)
- `LineItem`: itemId, label, quantity, unitPrice, lineTotal (computed)
- `Quote`: lineItems[], subtotal, labor, fees, modifiersApplied[], markup, tax, total, currency, language, notes
- All immutable; pricing functions are pure (no side effects).

## Core behavior
1. `generateQuote(kb, request)`:
   - `IntakeMapper.map()` → uses Claude (tool use) to select `{itemId, quantity, modifiers}` from the KB based on `request.freeText`. Output zod-validated against the KB (reject items not in KB).
   - `PricingEngine.compute()` → deterministic: line totals → subtotal → + labor (hours × rate) → + fees → apply modifiers → + markup → + tax → `Quote`.
   - `QuoteFormatter.render()` → human-readable quote in the requested language + structured object.
2. CLI demo: pick a practice catalog, type a treatment request, see the estimate. Works with `MockIntakeMapper` (no key) or `ClaudeIntakeMapper` (with key).

## Per-practice configuration
Adding a practice = adding one `clients/<name>.ts` catalog that exports a `KnowledgeBase` satisfying
the Zod schema. Catalog modules are auto-discovered by the CLI/server registry. **No core code
changes.** README documents this with a worked dental example.

## Acceptance criteria (TDD — write tests first)
- [x] `PricingEngine` is pure and unit-tested across totals, labor, fees, modifiers, markup, tax and rounding.
- [x] KB Zod validation rejects malformed configs; the synthetic dental catalog validates.
- [x] `MockIntakeMapper` drives `generateQuote` for dental-clinic without an API key.
- [x] `ClaudeIntakeMapper` output is schema- and KB-validated before pricing.
- [x] `QuoteFormatter` renders labels and values in it/sq/en.
- [x] Typecheck, Vitest and the ≥80% coverage gate pass.

## Engineering conventions
- Immutability everywhere; pricing engine is pure functions.
- Many small focused files; functions <50 lines; files <800 (aim 200–400).
- Validate all input (config, intake, model output) with zod; never trust external data.
- Comprehensive error handling; clear messages; never swallow errors.
- No hardcoded secrets — env + `.env.example`.

## Going live (README must document)
- Env: `ANTHROPIC_API_KEY` (mapper). Everything else runs locally.
- How to add a new practice catalog (step-by-step), how to switch language, how to extend rules/modifiers.

## Out of scope (YAGNI for MVP)
Autonomous diagnosis, treatment planning, insurance adjudication and real-patient production before
the documented clinical/privacy gates are closed.
