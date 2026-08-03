/**
 * Tests for dental assessment zod schemas (vision intake).
 */
import { describe, it, expect } from 'vitest';
import { DentalAssessmentSchema } from '../../src/dental/schemas.js';

describe('DentalAssessmentSchema', () => {
  const valid = {
    archFindings: [
      { arch: 'upper', observation: 'near-fully edentulous', confidence: 'high' },
    ],
    candidateTreatments: [
      {
        itemId: 'implant-standard',
        quantity: 4,
        arch: 'upper',
        rationale: 'edentulous upper arch + patient wants fixed teeth',
        needsConfirmation: true,
      },
    ],
    imageQuality: 'good',
    overallConfidence: 'medium',
    requiresClinicalConfirmation: true,
  };

  it('validates a correct assessment', () => {
    expect(DentalAssessmentSchema.safeParse(valid).success).toBe(true);
  });

  it('allows empty archFindings and candidateTreatments', () => {
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      archFindings: [],
      candidateTreatments: [],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an invalid overallConfidence', () => {
    expect(DentalAssessmentSchema.safeParse({ ...valid, overallConfidence: 'sure' }).success).toBe(false);
  });

  it('rejects an invalid arch in a finding', () => {
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      archFindings: [{ arch: 'middle', observation: 'x', confidence: 'low' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an invalid imageQuality', () => {
    expect(DentalAssessmentSchema.safeParse({ ...valid, imageQuality: 'blurry' }).success).toBe(false);
  });

  it('defaults requiresClinicalConfirmation to true when omitted', () => {
    const { requiresClinicalConfirmation: _r, ...rest } = valid;
    const r = DentalAssessmentSchema.safeParse(rest);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.requiresClinicalConfirmation).toBe(true);
  });

  it('rejects zero or negative candidate treatment quantity', () => {
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      candidateTreatments: [{ ...valid.candidateTreatments[0], quantity: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a candidate treatment without an arch', () => {
    const { arch: _arch, ...withoutArch } = valid.candidateTreatments[0];
    expect(DentalAssessmentSchema.safeParse({
      ...valid,
      candidateTreatments: [withoutArch],
    }).success).toBe(false);
  });

  it('rejects fractional or clinically impossible treatment quantities', () => {
    for (const quantity of [1.5, 33]) {
      const r = DentalAssessmentSchema.safeParse({
        ...valid,
        candidateTreatments: [{ ...valid.candidateTreatments[0], quantity }],
      });
      expect(r.success).toBe(false);
    }
  });

  it('caps the number of candidate lines before downstream aggregation', () => {
    const candidate = valid.candidateTreatments[0];
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      candidateTreatments: Array.from({ length: 33 }, () => candidate),
    });
    expect(r.success).toBe(false);
  });

  it('accepts and preserves optional existingRestorations', () => {
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      existingRestorations: [{ type: 'implant', arch: 'upper', count: 2 }],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.existingRestorations).toHaveLength(1);
  });

  it('rejects an invalid existing-restoration type', () => {
    const r = DentalAssessmentSchema.safeParse({
      ...valid,
      existingRestorations: [{ type: 'titanium-thing', count: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('still validates without existingRestorations (backwards compatible)', () => {
    expect(DentalAssessmentSchema.safeParse(valid).success).toBe(true);
  });

  it('defaults archFindings and candidateTreatments to [] when the model omits them', () => {
    const r = DentalAssessmentSchema.safeParse({
      imageQuality: 'fair',
      overallConfidence: 'low',
      requiresClinicalConfirmation: true,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.archFindings).toEqual([]);
      expect(r.data.candidateTreatments).toEqual([]);
    }
  });

  it('parses a fully sparse {} output with conservative safety defaults', () => {
    const r = DentalAssessmentSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.imageQuality).toBe('poor');
      expect(r.data.overallConfidence).toBe('low');
      expect(r.data.requiresClinicalConfirmation).toBe(true);
      expect(r.data.candidateTreatments).toEqual([]);
    }
  });
});
