/**
 * Types for the dental eval harness.
 *
 * The coarse labels are intentionally separated from optional item- and price-level
 * labels: a category/count match is not evidence that the commercial variant or
 * patient-facing price is correct.
 */
import type { Language, IntakeImage } from '../domain/types.js';

export interface NumericRange {
  readonly low: number;
  readonly high: number;
}

export interface CoarseOutcome {
  /** Sorted, de-duplicated treatment categories present (e.g. ['crowns','implants']) */
  readonly treatmentCategories: readonly string[];
  /** Predicted: the model's point implant estimate. Expected: the dentist's actual count. */
  readonly implantCount: number;
}

export interface ExpectedEvalOutcome extends CoarseOutcome {
  /** Optional dentist-confirmed quantities keyed by exact KB item ID. */
  readonly itemQuantities?: Readonly<Record<string, number>>;
  /** Optional expected patient-facing total interval in the KB currency. */
  readonly expectedTotalRange?: NumericRange;
}

export interface PredictedEvalOutcome extends CoarseOutcome {
  /** Production-sanitized quantities keyed by exact KB item ID. */
  readonly itemQuantities: Readonly<Record<string, number>>;
  /** The total interval the patient would see; null for a consultation-only result. */
  readonly patientFacingTotalRange: NumericRange | null;
}

export interface EvalCaseIntake {
  readonly freeText: string;
  readonly language: Language;
  readonly images?: readonly IntakeImage[];
}

export interface EvalCase {
  readonly name: string;
  readonly intake: EvalCaseIntake;
  readonly expected: ExpectedEvalOutcome;
  /** Rights holder/case-plan provenance copied into every persisted report. */
  readonly source?: string;
  readonly notes?: string;
}

export interface CaseComparison {
  readonly name: string;
  readonly predicted: PredictedEvalOutcome;
  readonly expected: ExpectedEvalOutcome;
  readonly source?: string;
  readonly notes?: string;
  readonly coarseCategoriesExactMatch: boolean;
  /** True when the dentist's actual implant count falls inside the model's indicative range. */
  readonly coarseImplantCountInRange: boolean;
  /** Category exact-match AND implant-count range containment. */
  readonly coarseOutcomeMatch: boolean;
  /** Null means this case has no exact-item label. */
  readonly itemQuantitiesExactMatch: boolean | null;
  /** Null means this case has no expected patient-total interval. */
  readonly patientTotalRangeOverlap: boolean | null;
  /** True when production would return consultationOnly rather than a number. */
  readonly abstained: boolean;
  /** Set when the mapper threw for this case (e.g. malformed model output). */
  readonly error?: string;
}

export interface EvalReport {
  readonly total: number;
  /** Cases where production would return a numerical estimate. */
  readonly answered: number;
  readonly abstained: number;
  readonly errors: number;
  readonly coveragePct: number;

  readonly coarseOutcomeMatches: number;
  /** Coarse matches divided by every case, including abstentions and provider errors. */
  readonly coarseOverallAgreementPct: number;
  /** Coarse matches divided only by answered cases. */
  readonly coarseSelectiveAgreementPct: number;
  /** Category exact matches divided only by answered cases. */
  readonly coarseCategoriesSelectiveExactAgreementPct: number;
  /** Implant range hits divided only by answered cases. */
  readonly coarseImplantCountSelectiveInRangePct: number;

  /** Cases carrying a dentist-confirmed exact-item label. */
  readonly itemLabels: number;
  readonly itemLabelCoveragePct: number;
  readonly answeredWithItemLabels: number;
  readonly itemQuantitiesExactMatches: number;
  /** Exact item matches divided by all item-labelled cases, including abstentions/errors. */
  readonly itemQuantitiesOverallExactAgreementPct: number;
  /** Exact item matches divided by answered, item-labelled cases. */
  readonly itemQuantitiesSelectiveExactAgreementPct: number;

  /** Cases carrying an expected patient-facing total interval. */
  readonly priceRangeLabels: number;
  readonly priceRangeLabelCoveragePct: number;
  readonly answeredWithPriceRangeLabels: number;
  readonly patientTotalRangeOverlaps: number;
  /** Overlaps divided by all price-labelled cases, including abstentions/errors. */
  readonly patientTotalRangeOverallOverlapPct: number;
  /** Overlaps divided by answered, price-labelled cases. */
  readonly patientTotalRangeSelectiveOverlapPct: number;

  readonly cases: readonly CaseComparison[];
}
