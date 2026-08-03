/**
 * Tests for generateDentalQuote — the dental pipeline that reuses the deterministic
 * PricingEngine + QuoteFormatter, driven by an offline MockDentalVisionMapper.
 */
import { describe, it, expect } from 'vitest';
import { generateDentalQuote } from '../../src/dental/generateDentalQuote.js';
import { MockDentalVisionMapper } from '../../src/dental/MockDentalVisionMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { DentalAssessment } from '../../src/dental/types.js';

const req = (freeText: string, language: 'it' | 'sq' | 'en' = 'en') => ({
  clientId: 'dental-clinic',
  language,
  freeText,
});

describe('generateDentalQuote', () => {
  it('produces an indicative priced quote from a mock assessment', async () => {
    const mapper = new MockDentalVisionMapper();
    const result = await generateDentalQuote(dentalClinicKB, req('missing teeth'), mapper);

    expect(result.consultationOnly).toBe(false);
    expect(result.quote).not.toBeNull();
    expect(result.quote!.total).toBeGreaterThan(0);
    expect(result.requiresClinicalConfirmation).toBe(true);
    expect(result.disclaimer.length).toBeGreaterThan(0);
    expect(result.text).toContain(result.disclaimer);
  });

  it('returns consultation-only (no quote) when input is too uncertain to price', async () => {
    const poor: DentalAssessment = {
      archFindings: [],
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 4, arch: 'upper', rationale: 'x', needsConfirmation: true },
      ],
      imageQuality: 'poor',
      overallConfidence: 'low',
      requiresClinicalConfirmation: true,
    };
    const mapper = new MockDentalVisionMapper({ blurry: poor });
    const result = await generateDentalQuote(dentalClinicKB, req('blurry photo'), mapper);

    expect(result.consultationOnly).toBe(true);
    expect(result.quote).toBeNull();
    expect(result.requiresClinicalConfirmation).toBe(true);
  });

  it('includes a localized disclaimer in the requested language', async () => {
    const mapper = new MockDentalVisionMapper();
    const it = await generateDentalQuote(dentalClinicKB, req('denti mancanti', 'it'), mapper);
    const en = await generateDentalQuote(dentalClinicKB, req('missing teeth', 'en'), mapper);

    expect(it.disclaimer.toLowerCase()).toContain('indicativo');
    expect(en.disclaimer.toLowerCase()).toContain('indicative');
  });

  it('rejects a clientId mismatch between request and KB', async () => {
    const mapper = new MockDentalVisionMapper();
    await expect(
      generateDentalQuote(
        dentalClinicKB,
        { clientId: 'different-dental-clinic', language: 'en', freeText: 'x' },
        mapper,
      ),
    ).rejects.toThrow();
  });

  it('rejects an invalid intake request', async () => {
    const mapper = new MockDentalVisionMapper();
    await expect(
      generateDentalQuote(dentalClinicKB, { clientId: 'dental-clinic' }, mapper),
    ).rejects.toThrow();
  });

  it('surfaces existing restorations as a note and never prices them', async () => {
    const withExisting: DentalAssessment = {
      archFindings: [],
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 2, arch: 'upper', rationale: 'new molar sites', needsConfirmation: true },
      ],
      existingRestorations: [{ type: 'implant', arch: 'upper', count: 2 }],
      imageQuality: 'fair',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
    };
    const mapper = new MockDentalVisionMapper({ existing: withExisting });
    const result = await generateDentalQuote(dentalClinicKB, req('existing implants case'), mapper);

    // existing implants are reported but NOT billed: only the 2 new implants are line items
    expect(result.quote!.lineItems).toHaveLength(1);
    expect(result.quote!.lineItems[0]!.itemId).toBe('implant-standard');
    // and the quote text transparently states existing work + new-work-only
    expect(result.text!.toLowerCase()).toContain('new work');
    expect(result.assessment.existingRestorations).toEqual([
      { type: 'implant', arch: 'upper', count: 2 },
    ]);
  });

  it('attaches an indicative price + implant range when implants are proposed', async () => {
    const withImplants: DentalAssessment = {
      archFindings: [],
      candidateTreatments: [
        { itemId: 'implant-standard', quantity: 3, arch: 'upper', rationale: 'x', needsConfirmation: true },
        { itemId: 'crown-zirconia', quantity: 3, arch: 'upper', rationale: 'y', needsConfirmation: true },
      ],
      imageQuality: 'fair',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
    };
    const mapper = new MockDentalVisionMapper({ rangecase: withImplants });
    const result = await generateDentalQuote(dentalClinicKB, req('rangecase'), mapper);

    expect(result.priceRange).toBeTruthy();
    expect(result.priceRange!.implantRange).toEqual({ low: 2, high: 3 });
    expect(result.priceRange!.totalRange.low).toBeLessThan(result.quote!.total);
    expect(result.text).toContain('–');
  });
});
