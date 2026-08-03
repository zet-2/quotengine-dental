/**
 * Tests for sanitizeAssessment — the safety gate applied before pricing.
 * Forces clinical confirmation and abstains on uncertain or policy-invalid input.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeAssessment } from '../../src/dental/sanitizeAssessment.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';

function make(overrides: Partial<DentalAssessment> = {}): DentalAssessment {
  return {
    archFindings: [],
    candidateTreatments: [
      { itemId: 'implant-standard', quantity: 3, arch: 'upper', rationale: 'x', needsConfirmation: true },
    ],
    imageQuality: 'good',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: false,
    ...overrides,
  };
}

describe('sanitizeAssessment', () => {
  it('forces requiresClinicalConfirmation to true even if the model said false', () => {
    expect(sanitizeAssessment(make(), dentalClinicKB).requiresClinicalConfirmation).toBe(true);
  });

  it('drops candidate treatments when imageQuality is poor', () => {
    expect(sanitizeAssessment(make({ imageQuality: 'poor' }), dentalClinicKB).candidateTreatments).toEqual([]);
  });

  it('drops candidate treatments when overallConfidence is low', () => {
    expect(sanitizeAssessment(make({ overallConfidence: 'low' }), dentalClinicKB).candidateTreatments).toEqual([]);
  });

  it('keeps candidate treatments when quality and confidence are acceptable', () => {
    expect(sanitizeAssessment(make(), dentalClinicKB).candidateTreatments.length).toBe(1);
  });

  it('prices only candidates explicitly assigned to the patient-selected arch', () => {
    const assessment = make({
      candidateTreatments: [
        { itemId: 'crown-porcelain', quantity: 2, arch: 'upper', rationale: 'upper', needsConfirmation: true },
        { itemId: 'implant-standard', quantity: 1, arch: 'lower', rationale: 'lower', needsConfirmation: true },
      ],
    });

    expect(sanitizeAssessment(assessment, dentalClinicKB, 'upper').candidateTreatments)
      .toEqual([assessment.candidateTreatments[0]]);
    expect(sanitizeAssessment(assessment, dentalClinicKB, 'lower').candidateTreatments)
      .toEqual([assessment.candidateTreatments[1]]);
    expect(sanitizeAssessment(assessment, dentalClinicKB, 'both').candidateTreatments)
      .toHaveLength(2);
  });

  it('abstains when implant scope reaches unsupported full-arch territory', () => {
    const fullArch = make({
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'full arch', needsConfirmation: true },
      ],
    });
    expect(sanitizeAssessment(fullArch, dentalClinicKB).candidateTreatments).toEqual([]);
  });

  it('does not mutate the input assessment', () => {
    const input = make({ imageQuality: 'poor' });
    sanitizeAssessment(input, dentalClinicKB);
    expect(input.candidateTreatments.length).toBe(1);
  });

  it('preserves existingRestorations through the gate', () => {
    const a = make({ existingRestorations: [{ type: 'implant', count: 2 }] });
    expect(sanitizeAssessment(a, dentalClinicKB).existingRestorations).toEqual([{ type: 'implant', count: 2 }]);
  });

  it('abstains when duplicate quantities exceed the aggregate policy cap', () => {
    const assessment = make({
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 20, arch: 'upper', rationale: 'upper', needsConfirmation: true },
        { itemId: 'implant-standard', quantity: 20, arch: 'lower', rationale: 'lower', needsConfirmation: true },
      ],
    });
    expect(sanitizeAssessment(assessment, dentalClinicKB).candidateTreatments).toEqual([]);
  });

  it('abstains on known KB items outside the automatic-quote allowlist', () => {
    const assessment = make({
      candidateTreatments: [
        { itemId: 'xray-panoramic', quantity: 1, arch: 'upper', rationale: 'diagnostic', needsConfirmation: true },
      ],
    });
    expect(sanitizeAssessment(assessment, dentalClinicKB).candidateTreatments).toEqual([]);

    const extraction = make({
      candidateTreatments: [
        { itemId: 'extraction', quantity: 1, arch: 'upper', rationale: 'possible extraction', needsConfirmation: true },
      ],
    });
    expect(sanitizeAssessment(extraction, dentalClinicKB).candidateTreatments).toEqual([]);
  });

  it('abstains when any model line claims it needs no confirmation', () => {
    const assessment = make({
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 1, arch: 'upper', rationale: 'x', needsConfirmation: false },
      ],
    });
    expect(sanitizeAssessment(assessment, dentalClinicKB).candidateTreatments).toEqual([]);
  });
});
