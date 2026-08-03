/**
 * Tests for coarse classification plus optional exact-item and price-range checks.
 */
import { describe, it, expect } from 'vitest';
import {
  classifyAssessment,
  compareOutcome,
  itemLabelsMatchCoarseLabels,
} from '../../src/eval/classify.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';
import type {
  ExpectedEvalOutcome,
  PredictedEvalOutcome,
} from '../../src/eval/types.js';

function assess(treatments: DentalAssessment['candidateTreatments']): DentalAssessment {
  return {
    archFindings: [],
    candidateTreatments: treatments,
    imageQuality: 'good',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: true,
  };
}

describe('classifyAssessment', () => {
  it('extracts the primary treatment categories and the implant point count', () => {
    const o = classifyAssessment(
      assess([
        { itemId: 'implant-standard', quantity: 3, arch: 'upper', rationale: 'x', needsConfirmation: true },
        { itemId: 'crown-porcelain', quantity: 3, arch: 'upper', rationale: 'y', needsConfirmation: true },
      ]),
      dentalClinicKB,
    );
    expect(o.treatmentCategories).toEqual(['crowns', 'implants']);
    expect(o.implantCount).toBe(3);
    expect(o.itemQuantities).toEqual({
      'crown-porcelain': 3,
      'implant-standard': 3,
    });
    expect(o.patientFacingTotalRange).toEqual({ low: 1840, high: 2370 });
  });

  it('counts only primary categories, ignoring x-ray/cleaning adjuncts', () => {
    const o = classifyAssessment(
      assess([
        { itemId: 'implant-standard', quantity: 2, arch: 'upper', rationale: 'x', needsConfirmation: true },
        { itemId: 'xray-panoramic', quantity: 1, arch: 'upper', rationale: 'p', needsConfirmation: true },
        { itemId: 'cleaning', quantity: 1, arch: 'upper', rationale: 'h', needsConfirmation: true },
      ]),
      dentalClinicKB,
    );
    expect(o.treatmentCategories).toEqual(['implants']);
    expect(o.implantCount).toBe(2);
  });

  it('classifies an empty assessment as no treatments', () => {
    const o = classifyAssessment(assess([]), dentalClinicKB);
    expect(o.treatmentCategories).toEqual([]);
    expect(o.implantCount).toBe(0);
    expect(o.itemQuantities).toEqual({});
    expect(o.patientFacingTotalRange).toBeNull();
  });
});

describe('compareOutcome (range containment)', () => {
  const predicted = (cats: string[], count: number): PredictedEvalOutcome => ({
    treatmentCategories: cats,
    implantCount: count,
    itemQuantities: {},
    patientFacingTotalRange: null,
  });
  const expected = (cats: string[], count: number): ExpectedEvalOutcome => ({
    treatmentCategories: cats,
    implantCount: count,
  });

  it('matches when categories agree and the dentist count falls in the predicted range', () => {
    // predicted 4 implants -> range [3,5]; dentist did 3 -> in range
    const r = compareOutcome(
      predicted(['crowns', 'implants'], 4),
      expected(['crowns', 'implants'], 3),
    );
    expect(r.coarseCategoriesExactMatch).toBe(true);
    expect(r.coarseImplantCountInRange).toBe(true);
    expect(r.coarseOutcomeMatch).toBe(true);
    expect(r.itemQuantitiesExactMatch).toBeNull();
    expect(r.patientTotalRangeOverlap).toBeNull();
  });

  it('flags out-of-range when the model grossly over-counts implants', () => {
    // predicted 7 -> range [5,9]; dentist did 4 -> out of range
    const r = compareOutcome(
      predicted(['crowns', 'implants'], 7),
      expected(['crowns', 'implants'], 4),
    );
    expect(r.coarseImplantCountInRange).toBe(false);
    expect(r.coarseOutcomeMatch).toBe(false);
  });

  it('flags a treatment-category mismatch', () => {
    const r = compareOutcome(predicted(['crowns', 'implants'], 1), expected(['crowns'], 0));
    expect(r.coarseCategoriesExactMatch).toBe(false);
    expect(r.coarseOutcomeMatch).toBe(false);
  });

  it('does not let a coarse match hide the wrong commercial item or patient price', () => {
    const premiumPrediction = classifyAssessment(
      assess([
        {
          itemId: 'implant-premium',
          quantity: 3,
          arch: 'upper',
          rationale: 'x',
          needsConfirmation: true,
        },
      ]),
      dentalClinicKB,
    );
    const r = compareOutcome(premiumPrediction, {
      treatmentCategories: ['implants'],
      implantCount: 3,
      itemQuantities: { 'implant-standard': 3 },
      expectedTotalRange: { low: 1060, high: 1590 },
    });

    expect(r.coarseOutcomeMatch).toBe(true);
    expect(r.itemQuantitiesExactMatch).toBe(false);
    expect(r.patientTotalRangeOverlap).toBe(false);
  });
});

describe('itemLabelsMatchCoarseLabels', () => {
  it('accepts consistent detailed labels', () => {
    expect(
      itemLabelsMatchCoarseLabels(
        {
          treatmentCategories: ['crowns', 'implants'],
          implantCount: 3,
          itemQuantities: { 'implant-standard': 3, 'crown-zirconia': 4 },
        },
        dentalClinicKB,
      ),
    ).toBe(true);
  });

  it('rejects item labels that contradict category or implant-count labels', () => {
    expect(
      itemLabelsMatchCoarseLabels(
        {
          treatmentCategories: ['implants'],
          implantCount: 4,
          itemQuantities: { 'implant-standard': 3, 'crown-zirconia': 4 },
        },
        dentalClinicKB,
      ),
    ).toBe(false);
  });
});
