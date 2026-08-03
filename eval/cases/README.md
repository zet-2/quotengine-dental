# Dental eval cases

Small regression fixtures for exercising the dental vision flow (`generateDentalQuote`). There are
currently six runnable cases. They are not training data and are not sufficient to establish
clinical accuracy. Run with:

```bash
npm run eval:dental                 # offline MOCK = pipeline smoke check only (no key needed)
npm run eval:dental:live            # LIVE model run; still not clinical validation
npm run eval:dental:live -- --cases <dir>
npm run eval:dental:live -- --cases <dir> --min-cases 25 --strict --output eval/reports/live.json
```

Each `*.json` here is one case. Cases whose image isn't on disk yet are **skipped** (not fatal),
so the templates below "activate" as you drop x-rays into `images/`.

`source` is required and is copied into the machine-readable report with optional `notes`, so every
expected label remains traceable to its plan, provenance and reuse terms.

`--strict` fails if any manifest/image is skipped, `--min-cases` prevents a tiny run from passing,
and `--output` writes a dated JSON report with model plus pipeline/prompt/tool/KB versions. Do not
commit a live report until its cases, rights and interpretation have been reviewed.

## Case format

```jsonc
{
  "name": "single-implant-molar",
  "source": "where the image + plan came from (provenance / license / dentist)",
  "intake": {
    "freeText": "the patient's message",
    "language": "it" | "sq" | "en",
    "images": [{ "kind": "panoramic_xray" | "photo", "mediaType": "image/jpeg", "path": "images/<file>" }]
  },
  "expected": {
    "treatmentCategories": ["implants", "crowns"],
    "implantCount": 3,
    "itemQuantities": { "implant-standard": 3, "crown-zirconia": 4 },
    "expectedTotalRange": { "low": 2800, "high": 3400 }
  }
}
```

`itemQuantities` and `expectedTotalRange` are optional because they require stronger commercial
labels than a case report normally provides. If present, quantities must use exact KB item IDs and
must agree with `treatmentCategories` and `implantCount`; inconsistent manifests are skipped (and
therefore fail `--strict`). The total range must be in the KB currency (currently EUR), with
`low <= high`.

## What's scored

The harness applies the same production sanitizer and automatic-quote policy before scoring. It
reports numerical-estimate **coverage**, consultation-only abstentions and provider errors. The
coarse metrics are explicitly named: overall coarse agreement includes every case, while selective
coarse agreement includes only cases where production returned a number. This prevents a
low-confidence raw model output from being counted as correct when the real funnel would withhold
the number.

- **treatmentCategories** — the PRIMARY treatments only: `implants`, `crowns`, `veneers`.
  Extraction, cleaning, diagnostics and every other non-auto-quotable item cause a
  production-policy abstention rather than being silently ignored.
- **implantCount** — the dentist's ACTUAL number of new implants. The eval passes the implant
  check when that count falls inside the model's bounded **indicative range** (approximately ±30%,
  capped at 32), reflecting that exact count from a 2D panoramic is uncertain.
- **itemQuantities** (optional) — the exact dentist-confirmed KB item IDs and quantities. Matching
  is exact, so `implant-standard` and `implant-premium` do not pass merely because their coarse
  category and implant count agree.
- **expectedTotalRange** (optional) — the expected patient-facing total interval. It passes when
  the production patient-total interval intersects the expected interval (inclusive endpoints).

The report separately states item-label and price-label coverage. The six current cases have no
verified detailed labels, so they correctly report **0% detailed-label coverage**; their coarse
scores must not be presented as item-selection or price accuracy. For detailed metrics, “overall”
uses every case carrying that label (including abstentions/errors) and “selective” uses answered
cases carrying that label.

Set `expected` from the **treating dentist's actual plan**, not from the model's output.

## Where to get images

1. **Best: the clinic's own anonymized cases + the quotes they gave** — the real go/no-go. See
   `../../docs/clinic-case-request.md` for the request template.
2. **CC-BY case reports** (image + dentist's plan in one) — e.g. PMC8998896 (`full-arch-both`).
   Filter for ones with a *panoramic* (many use CBCT). Reuse with attribution.
3. **Datasets for clean OPGs** — use the licensed candidates and restrictions in
   [`../datasets/registry.json`](../datasets/registry.json). Most label teeth/pathology, not
   treatment plans; a qualified label source must set `expected` for each.

## Caveats

- Case-report treatment labels are regression aids, not independent clinical ground truth. A
  qualified dentist must review them before any performance claim.
- **Veneers / cosmetic** need an intraoral **photo** — they're barely visible on a panoramic.
- Never commit non-anonymized patient images. Preserve the source and license attribution of every
  fixture; new assets require documented provenance, compatible reuse terms and qualified review.
