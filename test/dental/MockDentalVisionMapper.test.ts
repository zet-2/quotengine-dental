/**
 * Tests for MockDentalVisionMapper — offline vision mapper for tests + CLI demo
 * (no API key). Mirrors the MockIntakeMapper pattern.
 */
import { describe, it, expect } from 'vitest';
import { MockDentalVisionMapper } from '../../src/dental/MockDentalVisionMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';

const req = (freeText: string) => ({
  clientId: 'dental-clinic',
  language: 'en' as const,
  freeText,
});

describe('MockDentalVisionMapper', () => {
  it('returns a valid default assessment with KB-valid treatments', async () => {
    const mapper = new MockDentalVisionMapper();
    const a = await mapper.assess(req('missing some teeth'), dentalClinicKB);

    expect(a.candidateTreatments.length).toBeGreaterThan(0);
    const ids = new Set(dentalClinicKB.items.map((i) => i.id));
    for (const t of a.candidateTreatments) {
      expect(ids.has(t.itemId)).toBe(true);
    }
    expect(typeof a.requiresClinicalConfirmation).toBe('boolean');
  });

  it('uses a fuzzy override matched by freeText', async () => {
    const override: DentalAssessment = {
      archFindings: [{ arch: 'upper', observation: 'edentulous', confidence: 'high' }],
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
      ],
      imageQuality: 'good',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
    };
    const mapper = new MockDentalVisionMapper({ 'edentulous upper': override });
    const a = await mapper.assess(req('patient is edentulous upper arch'), dentalClinicKB);

    expect(a.candidateTreatments[0]!.itemId).toBe('implant-standard');
    expect(a.candidateTreatments[0]!.quantity).toBe(4);
  });

  it('rejects an override whose treatment itemId is not in the KB', async () => {
    const override: DentalAssessment = {
      archFindings: [],
      candidateTreatments: [
        { itemId: 'nonexistent', quantity: 1, arch: 'upper', rationale: 'x', needsConfirmation: true },
      ],
      imageQuality: 'good',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
    };
    const mapper = new MockDentalVisionMapper({ bad: override });
    await expect(mapper.assess(req('bad'), dentalClinicKB)).rejects.toThrow();
  });
});
