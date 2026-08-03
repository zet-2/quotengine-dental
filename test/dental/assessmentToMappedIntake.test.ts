/**
 * Tests for assessmentToMappedIntake — pure converter from a DentalAssessment
 * to the existing MappedIntake shape consumed by the deterministic PricingEngine.
 */
import { describe, it, expect } from 'vitest';
import { assessmentToMappedIntake } from '../../src/dental/assessmentToMappedIntake.js';
import type { DentalAssessment } from '../../src/dental/types.js';

function makeAssessment(overrides: Partial<DentalAssessment> = {}): DentalAssessment {
  return {
    archFindings: [],
    candidateTreatments: [],
    imageQuality: 'good',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: true,
    ...overrides,
  };
}

describe('assessmentToMappedIntake', () => {
  it('maps each candidate treatment to a line selection', () => {
    const a = makeAssessment({
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
        { itemId: 'crown-porcelain', quantity: 4, arch: 'upper', rationale: 'y', needsConfirmation: true },
      ],
    });
    expect(assessmentToMappedIntake(a).lines).toEqual([
      { itemId: 'implant-standard', quantity: 4 },
      { itemId: 'crown-porcelain', quantity: 4 },
    ]);
  });

  it('merges duplicate itemIds by summing quantity (e.g. both arches)', () => {
    const a = makeAssessment({
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
        { itemId: 'implant-standard', quantity: 2, arch: 'lower', rationale: 'y', needsConfirmation: true },
      ],
    });
    expect(assessmentToMappedIntake(a).lines).toEqual([
      { itemId: 'implant-standard', quantity: 6 },
    ]);
  });

  it('returns empty lines when there are no candidate treatments', () => {
    const mapped = assessmentToMappedIntake(makeAssessment());
    expect(mapped.lines).toEqual([]);
    expect(mapped.quoteModifierIds).toEqual([]);
  });

  it('does not auto-apply any quote modifiers (no surprise discounts/surcharges)', () => {
    const a = makeAssessment({
      candidateTreatments: [{ itemId: 'implant-standard', quantity: 5, arch: 'upper', rationale: 'x', needsConfirmation: true }],
    });
    expect(assessmentToMappedIntake(a).quoteModifierIds).toEqual([]);
  });

  it('passes through assessment notes', () => {
    const a = makeAssessment({ notes: 'indicative' });
    expect(assessmentToMappedIntake(a).notes).toBe('indicative');
  });
});
