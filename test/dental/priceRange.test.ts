/**
 * Tests for computePriceRange — an indicative € range driven by implant-count
 * uncertainty (re-prices the quote at the low/high implant counts).
 */
import { describe, it, expect } from 'vitest';
import { computePriceRange } from '../../src/dental/priceRange.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import { compute } from '../../src/pricing/PricingEngine.js';
import type { MappedIntake } from '../../src/domain/types.js';

describe('computePriceRange', () => {
  it('returns null when there are no implants', () => {
    const mapped: MappedIntake = {
      lines: [{ itemId: 'crown-porcelain', quantity: 2 }],
      quoteModifierIds: [],
    };
    expect(computePriceRange(dentalClinicKB, mapped, 'en')).toBeNull();
  });

  it('brackets the point total with a low/high driven by the implant range', () => {
    const mapped: MappedIntake = {
      lines: [
        { itemId: 'implant-standard', quantity: 3 },
        { itemId: 'crown-zirconia', quantity: 3 },
      ],
      quoteModifierIds: [],
    };
    const point = compute(dentalClinicKB, mapped, 'en').total;
    const range = computePriceRange(dentalClinicKB, mapped, 'en');

    expect(range).not.toBeNull();
    expect(range!.implantRange).toEqual({ low: 2, high: 3 });
    expect(range!.totalRange.low).toBeLessThan(point);
    expect(range!.totalRange.high).toBe(point);
  });

  it('refuses to price an implant point outside the automatic scope', () => {
    const mapped: MappedIntake = {
      lines: [{ itemId: 'implant-standard', quantity: 4 }],
      quoteModifierIds: [],
    };
    expect(() => computePriceRange(dentalClinicKB, mapped, 'en')).toThrow(/supported automatic-quote scope/);
  });

  it('allocates a multi-product implant range to the exact bounded counts', () => {
    const mapped: MappedIntake = {
      lines: [
        { itemId: 'implant-standard', quantity: 1 },
        { itemId: 'implant-premium', quantity: 1 },
      ],
      quoteModifierIds: [],
    };
    const range = computePriceRange(dentalClinicKB, mapped, 'en');
    const expectedLow = compute(dentalClinicKB, {
      lines: [{ itemId: 'implant-standard', quantity: 1 }],
      quoteModifierIds: [],
    }, 'en').total;
    const expectedHigh = compute(dentalClinicKB, {
      lines: [
        { itemId: 'implant-standard', quantity: 2 },
        { itemId: 'implant-premium', quantity: 1 },
      ],
      quoteModifierIds: [],
    }, 'en').total;

    expect(range?.implantRange).toEqual({ low: 1, high: 3 });
    expect(range?.totalRange).toEqual({ low: expectedLow, high: expectedHigh });
  });
});
