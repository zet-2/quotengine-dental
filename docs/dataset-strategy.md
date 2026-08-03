# Dataset strategy

Reviewed: 2026-07-13. This document is an engineering and licensing inventory, not a claim that
Quotengine has been trained on any of these datasets. The machine-readable source of truth is
[`eval/datasets/registry.json`](../eval/datasets/registry.json).

## What larger public datasets can and cannot improve

The current repository has no fine-tuning or proprietary training. Its six local cases are a small
evaluation fixture, not a training corpus and not clinical evidence. Larger panoramic datasets can
improve or benchmark perception tasks such as tooth numbering, missing-tooth detection, existing
implants, crowns, caries and lesions. Almost none provide the target needed by this product:

```text
radiograph + patient intake -> confirmed treatment plan -> final invoiced price/outcome
```

Consequently, adding thousands of pathology labels does not by itself validate a treatment plan or
an estimate. Price calculation is reproducible once treatment, quantity, modifiers and KB version
are correct; accuracy still depends on those inputs, current price data and non-radiographic
clinical factors. The image-to-treatment mapping is the main model uncertainty, not the only source
of error.

## Recommended order

1. Use **MMOral-OPG Bench** to compare model/prompt versions on an external dentist-validated
   benchmark. It tests understanding, not price accuracy.
2. Review **COde**'s DUA and use it for offline research because it is the most relevant public
   source found with images plus longitudinal diagnosis/treatment-plan text. It has no prices,
   mixed modalities and a single-center distribution.
3. Do not use datasets with missing, non-commercial or gated terms in product training until the
   rights holder or approved DUA explicitly permits the intended use. A public download is not a
   commercial license.
4. Build the defensible clinic dataset prospectively or from properly governed historical cases:
   de-identified image, intake, final clinician plan, changes after examination, final invoice,
   outcome and provenance. Split by patient, clinic and time to avoid leakage.

The proprietary dataset should be collected offline from completed clinical work. It does not
require inserting a doctor approval step in the live funnel; it requires a governed feedback loop
that joins the automatic estimate to the later confirmed outcome.

## Evaluation gates before accuracy claims

- Provenance and permitted purpose recorded for every image.
- Patient-level train/validation/test separation.
- A locked external test set never used for prompt tuning.
- Metrics split by image quality, language, treatment category and abstention.
- Calibration of interval coverage, not only exact treatment agreement.
- A dated report with model, prompt, tool schema, KB version and case count.
- No percentage advertised when it comes only from the mock mapper or the six-case fixture.

Mirrors on Kaggle, Roboflow or Hugging Face do not override the original rights holder's terms.
When licenses conflict, the dataset remains blocked until resolved in writing.
