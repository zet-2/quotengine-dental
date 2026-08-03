# ADR 0001: Keep price computation deterministic

- Status: accepted
- Date: 2026-05-25

## Context

A multimodal model is useful for converting unstructured patient input into coarse treatment
signals, but free-form numerical generation is difficult to reproduce, test and audit.

## Decision

The model may only return a structured assessment through a forced tool schema and may select only
item IDs present in the clinic knowledge base. TypeScript code applies quantities, labor, fees,
discounts, markup, tax and indicative uncertainty ranges. Invalid IDs or schemas fail closed.

## Consequences

- Identical validated inputs and KB versions produce identical prices.
- Model changes affect mapping accuracy, not arithmetic correctness.
- Every clinic price or rule change is reviewable source/configuration data.
- Correct arithmetic does not prove that the proposed treatment is clinically correct; that is a
  separate evaluation problem.
