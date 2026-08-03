/**
 * Tests for validateAssessmentAgainstKB — the guard that prevents the model
 * from inventing treatments that don't exist in the client's price list.
 */
import { describe, it, expect } from 'vitest';
import { validateAssessmentAgainstKB } from '../../src/dental/validation.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';

const base: DentalAssessment = {
  archFindings: [],
  candidateTreatments: [],
  imageQuality: 'good',
  overallConfidence: 'medium',
  requiresClinicalConfirmation: true,
};

describe('validateAssessmentAgainstKB', () => {
  it('accepts treatments whose itemIds exist in the KB', () => {
    const a: DentalAssessment = {
      ...base,
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
      ],
    };
    expect(validateAssessmentAgainstKB(a, dentalClinicKB).ok).toBe(true);
  });

  it('rejects treatments with itemIds not in the KB', () => {
    const a: DentalAssessment = {
      ...base,
      candidateTreatments: [
        { itemId: 'all-on-4-upper', quantity: 1, arch: 'upper', rationale: 'x', needsConfirmation: true },
      ],
    };
    const r = validateAssessmentAgainstKB(a, dentalClinicKB);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('all-on-4-upper');
  });

  it('accepts an assessment with no candidate treatments', () => {
    expect(validateAssessmentAgainstKB(base, dentalClinicKB).ok).toBe(true);
  });
});
