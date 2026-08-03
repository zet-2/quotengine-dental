/**
 * Production-facing prediction extraction and eval comparison. Pure.
 */
import type { KnowledgeBase, Language } from '../domain/types.js';
import type { DentalAssessment } from '../dental/types.js';
import type {
  ExpectedEvalOutcome,
  NumericRange,
  PredictedEvalOutcome,
} from './types.js';
import { implantCountRange } from '../dental/implantRange.js';
import { assessmentToMappedIntake } from '../dental/assessmentToMappedIntake.js';
import { computePriceRange } from '../dental/priceRange.js';
import { compute } from '../pricing/PricingEngine.js';

/** Categories allowed by the production automatic-quote policy and scored coarsely here. */
const PRIMARY_CATEGORIES = new Set(['implants', 'crowns', 'veneers']);

/**
 * Derive both coarse and commercial predictions from an already production-sanitized
 * assessment. Implant estimates use the same range as the patient response; other
 * estimates are represented as a point interval around the displayed quote total.
 */
export function classifyAssessment(
  assessment: DentalAssessment,
  kb: KnowledgeBase,
  language: Language = kb.defaultLanguage,
): PredictedEvalOutcome {
  const categoryByItem = new Map(kb.items.map((i) => [i.id, i.category] as const));
  const categories = new Set<string>();
  let implantCount = 0;

  for (const treatment of assessment.candidateTreatments) {
    const category = categoryByItem.get(treatment.itemId);
    if (category === undefined) continue;
    if (category === 'implants') implantCount += treatment.quantity;
    if (PRIMARY_CATEGORIES.has(category)) categories.add(category);
  }

  const mapped = assessmentToMappedIntake(assessment);
  const itemQuantities = Object.fromEntries(
    [...mapped.lines]
      .sort((left, right) => left.itemId.localeCompare(right.itemId))
      .map((line) => [line.itemId, line.quantity]),
  );

  let patientFacingTotalRange: NumericRange | null = null;
  if (mapped.lines.length > 0) {
    const quote = compute(kb, mapped, language);
    patientFacingTotalRange = computePriceRange(kb, mapped, language)?.totalRange ?? {
      low: quote.total,
      high: quote.total,
    };
  }

  return {
    treatmentCategories: Array.from(categories).sort(),
    implantCount,
    itemQuantities,
    patientFacingTotalRange,
  };
}

export interface OutcomeComparison {
  readonly coarseCategoriesExactMatch: boolean;
  readonly coarseImplantCountInRange: boolean;
  readonly coarseOutcomeMatch: boolean;
  readonly itemQuantitiesExactMatch: boolean | null;
  readonly patientTotalRangeOverlap: boolean | null;
}

function sameStringSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}

/** Guard against manifests whose detailed labels contradict their own coarse labels. */
export function itemLabelsMatchCoarseLabels(
  expected: ExpectedEvalOutcome,
  kb: KnowledgeBase,
): boolean {
  if (expected.itemQuantities === undefined) return true;

  const categoryByItem = new Map(kb.items.map((item) => [item.id, item.category] as const));
  const derivedCategories = new Set<string>();
  let derivedImplantCount = 0;

  for (const [itemId, quantity] of Object.entries(expected.itemQuantities)) {
    const category = categoryByItem.get(itemId);
    if (category === undefined) return false;
    if (PRIMARY_CATEGORIES.has(category)) derivedCategories.add(category);
    if (category === 'implants') derivedImplantCount += quantity;
  }

  return (
    sameStringSet([...derivedCategories], expected.treatmentCategories) &&
    derivedImplantCount === expected.implantCount
  );
}

function sameQuantities(
  predicted: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
): boolean {
  const predictedEntries = Object.entries(predicted).sort(([a], [b]) => a.localeCompare(b));
  const expectedEntries = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return (
    predictedEntries.length === expectedEntries.length &&
    predictedEntries.every(
      ([itemId, quantity], index) =>
        itemId === expectedEntries[index]?.[0] && quantity === expectedEntries[index]?.[1],
    )
  );
}

function rangesOverlap(predicted: NumericRange, expected: NumericRange): boolean {
  return predicted.low <= expected.high && expected.low <= predicted.high;
}

/**
 * Coarse comparison checks category set + implant-count range. Optional detailed
 * labels independently check exact item/quantity identity and patient-price overlap.
 */
export function compareOutcome(
  predicted: PredictedEvalOutcome,
  expected: ExpectedEvalOutcome,
): OutcomeComparison {
  const coarseCategoriesExactMatch = sameStringSet(
    predicted.treatmentCategories,
    expected.treatmentCategories,
  );
  const range = implantCountRange(predicted.implantCount);
  const coarseImplantCountInRange =
    expected.implantCount >= range.low && expected.implantCount <= range.high;
  const itemQuantitiesExactMatch = expected.itemQuantities
    ? sameQuantities(predicted.itemQuantities, expected.itemQuantities)
    : null;
  const patientTotalRangeOverlap = expected.expectedTotalRange
    ? predicted.patientFacingTotalRange !== null &&
      rangesOverlap(predicted.patientFacingTotalRange, expected.expectedTotalRange)
    : null;

  return {
    coarseCategoriesExactMatch,
    coarseImplantCountInRange,
    coarseOutcomeMatch: coarseCategoriesExactMatch && coarseImplantCountInRange,
    itemQuantitiesExactMatch,
    patientTotalRangeOverlap,
  };
}
