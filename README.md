# Quotengine Dental

[![CI](https://github.com/zet-2/quotengine-dental/actions/workflows/ci.yml/badge.svg)](https://github.com/zet-2/quotengine-dental/actions/workflows/ci.yml)

Quotengine Dental is a **guarded intake and deterministic estimate engine** for configurable dental
practices. It supports text-based treatment enquiries and, where appropriate, optional panoramic
images. A validated per-practice catalog drives pricing without changing the calculation logic.

This repository does not train or fine-tune a dental model. It makes an external multimodal model
operationally useful through a constrained contract, deterministic computation, constrained abstention,
privacy controls and a measurable evaluation harness.

## What makes it more than an Anthropic API call

| Layer | What the repository owns |
|---|---|
| Model boundary | Forced tool output, Zod validation, KB item allowlist, prompt/tool versioning |
| Safety | Poor/low-confidence abstention; raw findings never sent to the patient |
| Pricing | Pure TypeScript rules, versioned per-practice catalogs and bounded uncertainty; the model never calculates money |
| Lead funnel | Name, phone, email, preference, UTM attribution, immediate result/fallback |
| Health-data lifecycle | Consent-copy hashes, encrypted D1 payload, optional private R2, withdrawal, erasure, retention |
| Abuse/admin | Turnstile, native rate limits, exact CORS, Cloudflare Access identity and audit |
| Evidence | Node and Workers-runtime suites, OpenAPI contract, model card, dataset/license registry and eval harness |

See the [architecture](docs/architecture.md), [OpenAPI contract](openapi/quotengine.openapi.json),
[model card](docs/model-card.md), [threat model](docs/threat-model.md) and
[dataset strategy](docs/dataset-strategy.md).

> **Status:** pre-production. Arithmetic and software controls are tested; clinical mapping
> accuracy is not yet established. Every dental result is automatic, non-diagnostic, non-binding
> and requires an in-person clinical confirmation. The repository contains no real clinic price
> list or private patient dataset.

## Core design rule

**The LLM never does arithmetic.** Claude maps input to structured selections; all totals live in
`PricingEngine` as pure, deterministic TypeScript. This makes the financial calculation
reproducible and auditable. It does not, by itself, prove the clinical mapping is correct.

## Example practice

| Client | Description |
|--------|-------------|
| `dental-clinic` | Synthetic dental practice catalog — hygiene, crowns, veneers, diagnostics and implants |

The bundled prices, taxes and commercial terms are demonstration data. Replace them with an
approved practice catalog before any real use.

## Stack

- TypeScript ESM strict, Node 22+
- `@anthropic-ai/sdk` — Claude claude-sonnet-4-6 with tool use + prompt caching
- `zod` — all config, intake, and model output validated
- `vitest` — Node + Workers-runtime test suites with an enforced 80% core coverage floor
- `hono` — optional HTTP server

---

## Setup

```bash
# Prerequisites: Node 22+
git clone https://github.com/zet-2/quotengine-dental.git
cd quotengine-dental
npm ci

# Copy env file
cp .env.example .env
# Edit .env — uncomment/set ANTHROPIC_API_KEY for live mode
```

---

## Running the CLI demo

The CLI works **offline by default** (MockIntakeMapper) — no API key needed.

```bash
# Dental clinic client, English
npm run quote -- --client dental-clinic --lang en

# Dental clinic client, Italian
npm run quote -- --client dental-clinic --lang it

# Localized output for another configured locale (Albanian in this example)
npm run quote -- --client dental-clinic --lang sq
```

With `ANTHROPIC_API_KEY` set in `.env`, the CLI automatically loads it and uses `ClaudeIntakeMapper` (live Claude).

Type any customer request at the `>` prompt. Type `quit` to exit.

### Example session (dental-clinic, English)

```
> 2 zirconia crowns and a cleaning session
QUOTE
────────────────────────────────────────────────────────────
Generated at: 2026-05-25T10:00:00.000Z
Currency: EUR

Item                         Qty    Unit Price Line Total
────────────────────────────────────────────────────────────
Zirconia Crown               2      EUR 320.00 EUR 640.00
Professional Teeth Cleaning  1      EUR 50.00  EUR 50.00
────────────────────────────────────────────────────────────
Subtotal                                       EUR 690.00
Clinical services                              EUR 136.00
Tax                                            EUR 0.00
════════════════════════════════════════════════════════════
TOTAL                                          EUR 826.00

Notes: Demo catalog: replace prices, taxes and terms with practice-approved data before use.
```

---

## Running the optional HTTP server

```bash
npm start
# POST http://localhost:3000/quote
# GET  http://localhost:3000/health
```

Example request:

```bash
curl -X POST http://localhost:3000/quote \
  -H 'Content-Type: application/json' \
  -d '{"clientId":"dental-clinic","language":"en","freeText":"2 zirconia crowns"}'
```

The server is hardened for small production deployments out of the box:

- **Rate limiting** on all endpoints (fixed window per client IP, `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_SECONDS`, HTTP 429 with `Retry-After`)
- **Request body cap** (1 MiB on the quote API, HTTP 413) enforced before buffering
- **Leak-free errors**: intake/validation problems return 422 with a message; unexpected errors return a generic 500 and full details are logged server-side only
- **Graceful shutdown** on SIGTERM/SIGINT

### Production build

```bash
npm run build        # compiles to dist/ via tsc
npm run start:prod   # node dist/server.js
```

The single-process in-memory rate limiter is per instance — put a shared limiter (reverse proxy) in front if you run multiple replicas.

---

## Cloudflare Worker (dental lead workflow)

The repository now also contains a production-oriented Cloudflare Worker entrypoint with D1,
private R2, server-side Turnstile, native rate limiting, encrypted private lead payloads,
granular radiograph-storage withdrawal, retention/deletion, verified Cloudflare Access identities,
idempotent retries, and direct patient-facing, constrained estimate delivery. The contact is
persisted before inference: a provider failure returns a follow-up response without losing the
lead, while poor/low-confidence input returns `consultationOnly` instead of a guessed price.

```bash
npm run worker:types:check
npm run worker:test:types
npm run worker:test
npm run worker:dry-run
```

Cloudflare staging may use synthetic data after local checks. Real-patient production is
intentionally blocked by domain/config placeholders until the privacy, contractual, validation,
intended-purpose, and medical-device gates are complete. See
[docs/cloudflare-production.md](docs/cloudflare-production.md) and
[docs/privacy-go-live-checklist.md](docs/privacy-go-live-checklist.md).

---

## Dental vision demo & eval (multimodal)

The `dental-clinic` client has an additive vision pipeline: patient-declared goal + optional
panoramic x-ray + optional details → coarse
treatment signals → safety gate → deterministic pricing core → an **indicative, non-diagnostic**
price estimate delivered immediately, with a bounded uncertainty range when implants are present.
See [docs/spec-vision-intake.md](docs/spec-vision-intake.md) and
[docs/clinic-case-request.md](docs/clinic-case-request.md).

```bash
npm run dental:demo   # web upload demo on PORT (uses Claude if ANTHROPIC_API_KEY is set)
npm run dental:smoke  # one-shot smoke run against a sample case
npm run eval:dental   # local regression fixture; not a clinical accuracy claim
```

Without an API key the demo and eval run against the offline mock mapper (pipeline smoke check only).
The demo and Worker share a narrow patient-result projection: raw findings, model rationales,
client IDs and internal item/modifier IDs are never rendered in the patient HTML or returned in the
patient JSON. A patient who explicitly selects the full-arch demo path receives a versioned
synthetic range without a vision-model call. The response is explicitly marked as demonstration
data—not a market benchmark, clinic price or eligibility decision.
The safety gate still rejects four-or-more individual implant fixtures, so incomplete component
prices can never masquerade as the full package.
When the clinic supplies real prices, replace the single versioned entry and its terms in
[`src/dental/commercialCatalog.ts`](src/dental/commercialCatalog.ts); production requires the
catalog to be marked production-ready and the configured approval ID to match its exact compiled
prices and translated terms.
The six local cases are attributed CC BY case-report fixtures for pipeline regression only; they
are neither a training set nor a clinical benchmark. See the [model card](docs/model-card.md)
before interpreting or publishing any score.

---

## Running tests

```bash
npm test              # run once
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
npx tsc --noEmit      # type-check only
```

---

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | No | — | Enables live Claude mapping; if absent, MockIntakeMapper is used |
| `PORT` | No | `3000` | HTTP server port |
| `LOG_LEVEL` | No | `info` | `debug` \| `info` \| `warn` \| `error` |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per client per window (all endpoints) |
| `RATE_LIMIT_WINDOW_SECONDS` | No | `60` | Rate limit window length |

---

## How to configure another dental practice

Each practice gets a versioned, validated catalog. Add one file in `src/clients/`; the registry
auto-discovers files that export a `KnowledgeBase`.

### Step-by-step

1. **Create `src/clients/<your-practice>.ts`**

```typescript
import { loadKnowledgeBase } from '../kb/KnowledgeBase.js';
import type { KnowledgeBase } from '../domain/types.js';

const raw = {
  clientId: 'second-dental-clinic',
  clientName: 'Second Example Dental Clinic',
  languages: ['en', 'it'],
  defaultLanguage: 'en',
  currency: 'EUR',
  items: [
    {
      id: 'hygiene-session',
      name: { en: 'Dental Hygiene Session', it: 'Seduta di igiene dentale', sq: 'Seancë higjiene dentare' },
      unit: 'session',
      unitPrice: 75,
      laborHoursPerUnit: 1,
      category: 'preventive-care',
    },
    {
      id: 'zirconia-crown',
      name: { en: 'Zirconia Crown', it: 'Corona in zirconio', sq: 'Kurorë zirkoni' },
      unit: 'tooth',
      unitPrice: 320,
      laborHoursPerUnit: 1.2,
      category: 'crowns',
    },
  ],
  rules: [
    { kind: 'laborHourlyRate', value: 30 },
  ],
  modifiers: [
    {
      id: 'multi-crown-discount',
      label: { en: 'Multi-crown discount', it: 'Sconto corone multiple', sq: 'Zbritje për disa kurora' },
      type: 'percentage',
      value: -10,
    },
  ],
  markupPercent: 0,
  taxPercent: 0,
};

export const secondDentalClinicKB: KnowledgeBase = loadKnowledgeBase(raw);
```

Key rules for the raw config:
- `clientId` must be unique (used in API routing)
- All `name` objects must have `en`, `it`, and `sq` keys
- `unit` must be supported by `UnitSchema`; dental catalogs normally use `tooth`, `session` or `unit`
- Pricing rules and modifiers are validated before the catalog can load
- `modifier.type` must be `percentage` or `flat`
- Item IDs and modifier IDs must be unique within the KB
- `loadKnowledgeBase()` throws with clear messages if validation fails

2. **Run the CLI**

```bash
npm run quote -- --client second-dental-clinic --lang en
```

That's it. No registry or core code touched.

---

## Pricing computation flow

```
lineItems → subtotal
         + labor (total labor hours × laborHourlyRate)
         + fees (callOutFee + distanceFee)
         + modifier adjustments (applied to subtotal+labor+fees base)
         [+ minimum charge shortfall if total < minimumCharge]
         + markup (markupPercent of pre-markup total)
         + tax (taxPercent of post-markup total)
         = total
```

All monetary values are rounded to 2 decimal places using the `round2()` function at each step.

### Modifiers

- **quote-level percentage**: `amount = quote base × (value / 100)` — positive for surcharge, negative for discount
- **line-level percentage**: `amount = line total × (value / 100)` and only affects that line
- **flat**: `amount = value` — fixed addition/subtraction regardless of base
- **conditional**: a modifier only applies when ALL its conditions pass (field + operator + value)

Conditional fields: `subtotal`, `quantity`, `category`
Operators: `eq`, `gt`, `lt`, `gte`, `lte`
At quote level, `subtotal` means the quote base before quote-level modifiers. At line level, `subtotal`, `quantity`, and `category` are evaluated from that specific line.

---

## Architecture

```
src/
  domain/
    types.ts          # All domain types (readonly, immutable)
    schemas.ts        # Zod schemas for runtime validation
  kb/
    KnowledgeBase.ts  # loadKnowledgeBase(), getItemById(), etc.
  intake/
    IntakeMapper.ts   # Interface
    ClaudeIntakeMapper.ts  # Real LLM mapper (requires API key)
    MockIntakeMapper.ts    # Offline/test mapper (keyword heuristics)
    validation.ts     # KB validation of model output
  pricing/
    PricingEngine.ts  # compute() — pure deterministic
    rules.ts          # Pure helper functions
  format/
    QuoteFormatter.ts # renderText(), renderJSON()
  clients/
    index.ts          # Auto-discovery registry (buildRegistry, loadClients)
    dental-clinic.ts  # Synthetic example practice catalog
  api/
    generateQuote.ts  # Pipeline orchestrator
    createApp.ts      # Hono routes (testable without sockets)
  http/
    nodeAdapter.ts    # Node→fetch adapter: body cap, remote-addr stamping
    rateLimit.ts      # Fixed-window rate limiter middleware
  dental/             # Additive vision pipeline (x-ray → indicative range)
  eval/               # Versioned, machine-readable evaluation harness
  worker/             # Cloudflare lead API, crypto, auth, storage and retention
  log.ts              # LOG_LEVEL-aware logger
  env.ts              # Zod env + .env loading + mapper selection
  cli.ts              # Interactive CLI demo
  server.ts           # HTTP server entrypoint (composition only)
test/                 # Mirrors src/ structure
openapi/              # Machine-readable Worker contract
docs/                 # Architecture, ADRs, model card, threat model and runbooks
migrations/           # Forward-only D1 schema history
```

---

## Going live with Claude

1. Set `ANTHROPIC_API_KEY` in your environment or `.env`
2. The engine automatically switches to `ClaudeIntakeMapper`
3. Claude uses **tool use** to propose items from the KB
4. Model output is Zod-validated against the KB, so unknown IDs cannot reach pricing
5. Prompt caching is enabled on the KB/system block to reduce cost on repeated calls

The text-only CLI mapper defaults to `claude-sonnet-4-6`. The Worker and live dental eval use the
configured `ANTHROPIC_MODEL`; change it only together with a dated evaluation and versioned model
metadata.

---

## License

Quotengine source code and original documentation are released under the
[MIT License](LICENSE). Third-party datasets and evaluation assets keep their respective
licenses and provenance requirements; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
