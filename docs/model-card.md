# Model card: dental estimate mapping pipeline

- Pipeline version: `2.3.0`
- Prompt version: `2026-07-13.direct-estimate-v4-required-arch`
- Tool schema version: `3`
- Price KB version: `2026-07-13`
- Synthetic demo catalog: `2026-08-03.demo-v1`
- Status: pre-production; accuracy not clinically validated

## Summary

Quotengine does **not** train, fine-tune or host a proprietary dental model. It calls a configured
Anthropic multimodal model and constrains it to a structured `DentalAssessment`. The surrounding
software validates that structure, removes unsafe candidates under uncertainty and calculates
prices deterministically from a versioned clinic knowledge base.

## Intended use

- Create an immediate, indicative dental estimate that supports a practice enquiry.
- Identify coarse, clearly visible treatment signals from a panoramic radiograph plus patient text.
- Return no numerical estimate when image quality or overall confidence is insufficient.
- Return localized output for configured locales; the example catalog ships with English, Italian
  and Albanian translations.

## Out-of-scope use

- Diagnosis, triage, emergency advice or detection of all pathology.
- A final treatment plan, medical recommendation, eligibility decision or contractual quote.
- Replacement for clinical examination, additional imaging or dentist judgment.
- Use on children or other populations not represented by a validated evaluation without a new
  risk assessment.

## Pipeline

1. Validate structured patient intent; decode and canonicalize one JPEG/PNG panoramic image when
   supplied (required for vision-item paths, optional for the demo full-arch path).
2. When the patient declares a full-arch goal, resolve the versioned synthetic demo range
   directly from the selected upper/lower/both target. This branch does not inspect the image,
   invoke Anthropic, diagnose eligibility or create a clinical assessment.
3. Otherwise send image, patient intent/message and the allowed KB item list to Anthropic.
4. Force one structured tool call; require an upper/lower arch on every candidate, validate with
   Zod and reject IDs absent from the KB.
5. Drop all candidate treatments when image quality is `poor`, confidence is `low`, an item outside
   the implants/crowns/veneers auto-quote allowlist is proposed, or bounded candidate/aggregate
   quantity policy is exceeded. Multiple material/system alternatives from one exclusive group also
   produce an abstention instead of being added together. Four or more individual implants remain
   blocked because fixture-only pricing is not a complete prosthetic package.
6. Compute line items, labor, fees and tax in pure TypeScript; implant-bearing estimates also get
   an uncertainty range whose upper bound never exceeds the supported three-fixture scope.
7. Return an automatic, non-binding result with mandatory in-person confirmation. The demo branch
   is explicitly marked `synthetic_demo_catalog`, with a per-arch and total range.

The patient response deliberately excludes raw findings, rationales and the full model assessment.

## Training and evaluation data

There is no Quotengine training set. This public snapshot contains six small CC BY case-report
evaluation cases and no patient-supplied images. They are useful for pipeline and regression
development, not for a clinical accuracy claim. Their source and license attribution must remain
attached to every redistributed copy. Every future asset must pass provenance, license, privacy
and permitted-purpose review before merge.

Larger candidate datasets and their licensing gates are recorded in
[`eval/datasets/registry.json`](../eval/datasets/registry.json). Most label perception tasks, not
confirmed treatment plans or prices.

The current cases carry coarse category/implant-count labels only. They have no verified exact-item
or expected-total-range labels, so the detailed item-label and price-label coverage is 0%. A coarse
match must not be reported as evidence that the commercial variant or patient price was correct.

## Performance

No live, locked, dentist-labeled evaluation report is currently checked into the repository.
Therefore:

- coarse category/implant-count agreement: not established on a locked clinical set;
- exact item/quantity agreement: not established (0 verified item-level labels);
- patient-total range overlap and interval calibration: not established (0 verified price labels);
- subgroup/language performance: not established;
- mock-eval results: implementation tests only, not model performance.

Any future claim must state the model, all four version identifiers, dataset provenance, case count,
patient-level split, abstention policy, item/price label coverage, metric denominators and dated
metrics. Eval report schema v3 separates explicitly coarse overall/selective agreement from exact
item/quantity agreement and patient-total range overlap.

## Known failure modes

- A 2D panoramic image hides depth and does not establish bone, soft-tissue or restorative details.
- Existing restorations can be confused with proposed new work.
- The patient message can bias visual interpretation or attempt prompt injection.
- Image artifacts, cropping, burned-in identifiers and rare conditions can degrade output.
- Dataset and clinic/population shift can invalidate apparent benchmark performance.
- A structurally valid candidate treatment can still be clinically wrong.
- Provider/model updates can change behavior even when application code is unchanged.
- Synthetic demo values can anchor expectations if exposed as real prices, and exclusions may
  materially change the final total.

## Safety mechanisms

- Forced structured output and a clinical-only automatic-quote item list.
- Runtime schema, KB, confirmation-flag and aggregate-quantity validation.
- Conservative prompt and deterministic post-model abstention.
- No price arithmetic by the model.
- Non-binding disclaimer and `requiresInPersonConfirmation=true` in every patient estimate.
- Contact retained with a constrained follow-up response on provider/model failure.
- Full-arch range isolated from the clinical KB, selected only from declared intent/target area,
  versioned in every result and resolved without model inference.
- Four-or-more fixture lines remain rejected, preventing double counting or an incomplete package.

These controls reduce failure impact; they do not convert the system into a clinically validated
medical product.
