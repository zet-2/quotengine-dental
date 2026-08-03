/**
 * Tests for runEval — drives cases through a (mock) vision mapper and aggregates
 * coarse plus optional item/price metrics. Uses deterministic offline overrides.
 */
import { describe, it, expect } from 'vitest';
import { runEval } from '../../src/eval/runEval.js';
import { MockDentalVisionMapper } from '../../src/dental/MockDentalVisionMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';
import type { DentalVisionMapper } from '../../src/dental/DentalVisionMapper.js';
import type { EvalCase } from '../../src/eval/types.js';

function assess(treatments: DentalAssessment['candidateTreatments']): DentalAssessment {
  return {
    archFindings: [],
    candidateTreatments: treatments,
    imageQuality: 'good',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: true,
  };
}

describe('runEval', () => {
  it('computes explicitly coarse agreement and reports absent detailed labels', async () => {
    const mapper = new MockDentalVisionMapper({
      caseA: assess([{ itemId: 'implant-standard', quantity: 3, arch: 'upper', rationale: 'x', needsConfirmation: true }]),
      caseB: assess([{ itemId: 'crown-porcelain', quantity: 1, arch: 'upper', rationale: 'y', needsConfirmation: true }]),
    });
    const cases: EvalCase[] = [
      { name: 'A', intake: { freeText: 'caseA', language: 'en' }, expected: { treatmentCategories: ['implants'], implantCount: 3 }, source: 'dentist-confirmed case A' },
      { name: 'B', intake: { freeText: 'caseB', language: 'en' }, expected: { treatmentCategories: ['implants'], implantCount: 3 } },
    ];

    const report = await runEval(cases, mapper, dentalClinicKB);

    expect(report.total).toBe(2);
    expect(report.answered).toBe(2);
    expect(report.coveragePct).toBe(100);
    expect(report.coarseOutcomeMatches).toBe(1);
    expect(report.coarseOverallAgreementPct).toBe(50);
    expect(report.coarseSelectiveAgreementPct).toBe(50);
    expect(report.cases[0]!.coarseOutcomeMatch).toBe(true);
    expect(report.cases[0]!.source).toBe('dentist-confirmed case A');
    expect(report.cases[1]!.coarseOutcomeMatch).toBe(false);
    expect(report.itemLabels).toBe(0);
    expect(report.itemLabelCoveragePct).toBe(0);
    expect(report.itemQuantitiesOverallExactAgreementPct).toBe(0);
    expect(report.priceRangeLabels).toBe(0);
    expect(report.priceRangeLabelCoveragePct).toBe(0);
    expect(report.patientTotalRangeOverallOverlapPct).toBe(0);
    expect(report.cases[0]!.itemQuantitiesExactMatch).toBeNull();
    expect(report.cases[0]!.patientTotalRangeOverlap).toBeNull();
  });

  it('reports 0% agreement for an empty case set without dividing by zero', async () => {
    const report = await runEval([], new MockDentalVisionMapper(), dentalClinicKB);
    expect(report.total).toBe(0);
    expect(report.coveragePct).toBe(0);
    expect(report.coarseSelectiveAgreementPct).toBe(0);
    expect(report.coarseOverallAgreementPct).toBe(0);
  });

  it('records a per-case error without aborting the whole run', async () => {
    const throwingMapper: DentalVisionMapper = {
      async assess(request) {
        if (request.freeText.includes('boom')) throw new Error('model failure');
        return assess([
          { itemId: 'implant-standard', quantity: 2, arch: 'upper', rationale: 'x', needsConfirmation: true },
        ]);
      },
    };
    const cases: EvalCase[] = [
      { name: 'ok', intake: { freeText: 'fine', language: 'en' }, expected: { treatmentCategories: ['implants'], implantCount: 2 } },
      { name: 'bad', intake: { freeText: 'boom', language: 'en' }, expected: { treatmentCategories: ['implants'], implantCount: 2 } },
    ];

    const report = await runEval(cases, throwingMapper, dentalClinicKB);

    expect(report.total).toBe(2);
    expect(report.answered).toBe(1);
    expect(report.errors).toBe(1);
    expect(report.coveragePct).toBe(50);
    expect(report.coarseOutcomeMatches).toBe(1);
    const bad = report.cases.find((c) => c.name === 'bad')!;
    expect(bad.coarseOutcomeMatch).toBe(false);
    expect(bad.error).toBeTruthy();
  });

  it('scores the production-sanitized result as an abstention, not a match', async () => {
    const lowConfidence: DentalVisionMapper = {
      async assess() {
        return {
          ...assess([
            { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
          ]),
          overallConfidence: 'low',
        };
      },
    };
    const cases: EvalCase[] = [{
      name: 'would-have-looked-correct',
      intake: { freeText: 'case', language: 'en' },
      expected: { treatmentCategories: ['implants'], implantCount: 4 },
    }];

    const report = await runEval(cases, lowConfidence, dentalClinicKB);

    expect(report).toEqual(expect.objectContaining({
      total: 1,
      answered: 0,
      abstained: 1,
      coarseOutcomeMatches: 0,
      coveragePct: 0,
      coarseSelectiveAgreementPct: 0,
    }));
    expect(report.cases[0]).toEqual(expect.objectContaining({
      abstained: true,
      coarseOutcomeMatch: false,
      predicted: {
        treatmentCategories: [],
        implantCount: 0,
        itemQuantities: {},
        patientFacingTotalRange: null,
      },
    }));
  });

  it('does not hide an extra extraction behind otherwise matching crown categories', async () => {
    const mapper: DentalVisionMapper = {
      async assess() {
        return assess([
          { itemId: 'crown-porcelain', quantity: 2, arch: 'upper', rationale: 'crowns', needsConfirmation: true },
          { itemId: 'extraction', quantity: 1, arch: 'upper', rationale: 'possible extraction', needsConfirmation: true },
        ]);
      },
    };
    const report = await runEval([{
      name: 'extra-extraction',
      intake: { freeText: 'case', language: 'en' },
      expected: { treatmentCategories: ['crowns'], implantCount: 0 },
    }], mapper, dentalClinicKB);

    expect(report.cases[0]).toEqual(expect.objectContaining({
      abstained: true,
      coarseOutcomeMatch: false,
    }));
    expect(report.coarseSelectiveAgreementPct).toBe(0);
  });

  it('fails item and price checks when premium is predicted for a standard-labelled case', async () => {
    const mapper = new MockDentalVisionMapper({
      premium: assess([
        {
          itemId: 'implant-premium',
          quantity: 3,
          arch: 'upper',
          rationale: 'x',
          needsConfirmation: true,
        },
      ]),
    });
    const report = await runEval(
      [
        {
          name: 'standard-vs-premium',
          intake: { freeText: 'premium', language: 'en' },
          expected: {
            treatmentCategories: ['implants'],
            implantCount: 3,
            itemQuantities: { 'implant-standard': 3 },
            expectedTotalRange: { low: 1060, high: 1590 },
          },
        },
      ],
      mapper,
      dentalClinicKB,
    );

    expect(report).toEqual(
      expect.objectContaining({
        coarseOutcomeMatches: 1,
        coarseSelectiveAgreementPct: 100,
        itemLabels: 1,
        itemLabelCoveragePct: 100,
        itemQuantitiesExactMatches: 0,
        itemQuantitiesOverallExactAgreementPct: 0,
        itemQuantitiesSelectiveExactAgreementPct: 0,
        priceRangeLabels: 1,
        priceRangeLabelCoveragePct: 100,
        patientTotalRangeOverlaps: 0,
        patientTotalRangeOverallOverlapPct: 0,
        patientTotalRangeSelectiveOverlapPct: 0,
      }),
    );
    expect(report.cases[0]).toEqual(
      expect.objectContaining({
        coarseOutcomeMatch: true,
        itemQuantitiesExactMatch: false,
        patientTotalRangeOverlap: false,
        predicted: expect.objectContaining({
          itemQuantities: { 'implant-premium': 3 },
          patientFacingTotalRange: { low: 1700, high: 2550 },
        }),
      }),
    );
  });
});
