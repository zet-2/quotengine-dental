/**
 * Tests for the pure parsing/validation core of ClaudeDentalVisionMapper.
 * (The network call itself is thin glue, verified live with an API key.)
 * This guards the security-critical path: the model's tool output is zod-validated
 * and KB-validated before it is ever trusted.
 */
import { describe, it, expect } from 'vitest';
import { parseDentalAssessmentToolInput } from '../../src/dental/ClaudeDentalVisionMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

const validInput = {
  archFindings: [{ arch: 'upper', observation: 'edentulous', confidence: 'high' }],
  candidateTreatments: [
    { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
  ],
  imageQuality: 'good',
  overallConfidence: 'medium',
  requiresClinicalConfirmation: true,
};

describe('parseDentalAssessmentToolInput', () => {
  it('parses and validates a well-formed tool input', () => {
    const a = parseDentalAssessmentToolInput(validInput, dentalClinicKB);
    expect(a.candidateTreatments[0]!.itemId).toBe('implant-standard');
    expect(a.imageQuality).toBe('good');
  });

  it('throws on schema-invalid tool input (bad enum)', () => {
    expect(() =>
      parseDentalAssessmentToolInput({ ...validInput, imageQuality: 'blurry' }, dentalClinicKB),
    ).toThrow();
  });

  it('rejects a tool candidate without an arch before patient-scope filtering', () => {
    expect(() => parseDentalAssessmentToolInput({
      ...validInput,
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 1, rationale: 'x', needsConfirmation: true },
      ],
    }, dentalClinicKB)).toThrow(/invalid tool output schema/);
  });

  it('throws when a candidate treatment itemId is not in the KB (no invented treatments)', () => {
    expect(() =>
      parseDentalAssessmentToolInput(
        {
          ...validInput,
          candidateTreatments: [
            { itemId: 'all-on-4', quantity: 1, arch: 'upper', rationale: 'x', needsConfirmation: true },
          ],
        },
        dentalClinicKB,
      ),
    ).toThrow(/all-on-4/);
  });
});
