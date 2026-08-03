/**
 * Drive eval cases through a DentalVisionMapper and aggregate production-policy
 * coverage, explicitly coarse agreement, and optional item/price metrics.
 */
import type { KnowledgeBase, IntakeRequest } from '../domain/types.js';
import type { DentalVisionMapper } from '../dental/DentalVisionMapper.js';
import type {
  EvalCase,
  EvalReport,
  CaseComparison,
  ExpectedEvalOutcome,
  PredictedEvalOutcome,
} from './types.js';
import { classifyAssessment, compareOutcome } from './classify.js';
import { sanitizeAssessment } from '../dental/sanitizeAssessment.js';

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10;
}

const EMPTY_PREDICTION: PredictedEvalOutcome = {
  treatmentCategories: [],
  implantCount: 0,
  itemQuantities: {},
  patientFacingTotalRange: null,
};

function unsuccessfulComparison(expected: ExpectedEvalOutcome) {
  return {
    coarseCategoriesExactMatch: false,
    coarseImplantCountInRange: false,
    coarseOutcomeMatch: false,
    itemQuantitiesExactMatch: expected.itemQuantities === undefined ? null : false,
    patientTotalRangeOverlap: expected.expectedTotalRange === undefined ? null : false,
  } as const;
}

export async function runEval(
  cases: readonly EvalCase[],
  mapper: DentalVisionMapper,
  kb: KnowledgeBase,
): Promise<EvalReport> {
  const comparisons: CaseComparison[] = [];

  for (const evalCase of cases) {
    const request: IntakeRequest = {
      clientId: kb.clientId,
      language: evalCase.intake.language,
      freeText: evalCase.intake.freeText,
      ...(evalCase.intake.images ? { images: evalCase.intake.images } : {}),
    };

    try {
      const assessment = await mapper.assess(request, kb);
      // Detailed and coarse predictions are both derived only after the production sanitizer.
      const sanitized = sanitizeAssessment(assessment, kb);
      const predicted = classifyAssessment(sanitized, kb, evalCase.intake.language);
      if (sanitized.candidateTreatments.length === 0) {
        comparisons.push({
          name: evalCase.name,
          predicted,
          expected: evalCase.expected,
          ...(evalCase.source ? { source: evalCase.source } : {}),
          ...(evalCase.notes ? { notes: evalCase.notes } : {}),
          ...unsuccessfulComparison(evalCase.expected),
          abstained: true,
        });
        continue;
      }
      const comparison = compareOutcome(predicted, evalCase.expected);
      comparisons.push({
        name: evalCase.name,
        predicted,
        expected: evalCase.expected,
        ...(evalCase.source ? { source: evalCase.source } : {}),
        ...(evalCase.notes ? { notes: evalCase.notes } : {}),
        abstained: false,
        ...comparison,
      });
    } catch (err) {
      comparisons.push({
        name: evalCase.name,
        predicted: EMPTY_PREDICTION,
        expected: evalCase.expected,
        ...(evalCase.source ? { source: evalCase.source } : {}),
        ...(evalCase.notes ? { notes: evalCase.notes } : {}),
        ...unsuccessfulComparison(evalCase.expected),
        abstained: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const total = comparisons.length;
  const abstained = comparisons.filter((comparison) => comparison.abstained).length;
  const errors = comparisons.filter((comparison) => comparison.error !== undefined).length;
  const answered = total - abstained - errors;
  const answeredCases = comparisons.filter(
    (comparison) => !comparison.abstained && comparison.error === undefined,
  );

  const coarseOutcomeMatches = comparisons.filter((c) => c.coarseOutcomeMatch).length;
  const coarseCategoriesMatched = answeredCases.filter(
    (c) => c.coarseCategoriesExactMatch,
  ).length;
  const coarseImplantInRangeCount = answeredCases.filter(
    (c) => c.coarseImplantCountInRange,
  ).length;

  const itemLabelledCases = comparisons.filter(
    (comparison) => comparison.expected.itemQuantities !== undefined,
  );
  const answeredItemLabelledCases = answeredCases.filter(
    (comparison) => comparison.expected.itemQuantities !== undefined,
  );
  const itemQuantitiesExactMatches = itemLabelledCases.filter(
    (comparison) => comparison.itemQuantitiesExactMatch === true,
  ).length;

  const priceLabelledCases = comparisons.filter(
    (comparison) => comparison.expected.expectedTotalRange !== undefined,
  );
  const answeredPriceLabelledCases = answeredCases.filter(
    (comparison) => comparison.expected.expectedTotalRange !== undefined,
  );
  const patientTotalRangeOverlaps = priceLabelledCases.filter(
    (comparison) => comparison.patientTotalRangeOverlap === true,
  ).length;

  return {
    total,
    answered,
    abstained,
    errors,
    coveragePct: pct(answered, total),

    coarseOutcomeMatches,
    coarseOverallAgreementPct: pct(coarseOutcomeMatches, total),
    coarseSelectiveAgreementPct: pct(coarseOutcomeMatches, answered),
    coarseCategoriesSelectiveExactAgreementPct: pct(coarseCategoriesMatched, answered),
    coarseImplantCountSelectiveInRangePct: pct(coarseImplantInRangeCount, answered),

    itemLabels: itemLabelledCases.length,
    itemLabelCoveragePct: pct(itemLabelledCases.length, total),
    answeredWithItemLabels: answeredItemLabelledCases.length,
    itemQuantitiesExactMatches,
    itemQuantitiesOverallExactAgreementPct: pct(
      itemQuantitiesExactMatches,
      itemLabelledCases.length,
    ),
    itemQuantitiesSelectiveExactAgreementPct: pct(
      itemQuantitiesExactMatches,
      answeredItemLabelledCases.length,
    ),

    priceRangeLabels: priceLabelledCases.length,
    priceRangeLabelCoveragePct: pct(priceLabelledCases.length, total),
    answeredWithPriceRangeLabels: answeredPriceLabelledCases.length,
    patientTotalRangeOverlaps,
    patientTotalRangeOverallOverlapPct: pct(
      patientTotalRangeOverlaps,
      priceLabelledCases.length,
    ),
    patientTotalRangeSelectiveOverlapPct: pct(
      patientTotalRangeOverlaps,
      answeredPriceLabelledCases.length,
    ),

    cases: comparisons,
  };
}
