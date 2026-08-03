/**
 * Unit tests for PricingEngine.compute() — exhaustive coverage.
 * All cases use pure inputs (no I/O).
 */
import { describe, it, expect } from 'vitest';
import { compute } from '../../src/pricing/PricingEngine.js';
import type { KnowledgeBase, MappedIntake } from '../../src/domain/types.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

const FIXED_DATE = '2026-05-25T00:00:00.000Z';

// ─── Helper builders ──────────────────────────────────────────────────────────

function makeMinimalKB(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    clientId: 'test',
    clientName: 'Test Client',
    languages: ['en'],
    defaultLanguage: 'en',
    currency: 'EUR',
    items: [
      {
        id: 'item-a',
        name: { en: 'Item A', it: 'Voce A', sq: 'Zë A' },
        unit: 'unit',
        unitPrice: 100,
        category: 'general',
      },
      {
        id: 'item-b',
        name: { en: 'Item B', it: 'Voce B', sq: 'Zë B' },
        unit: 'hour',
        unitPrice: 50,
        laborHoursPerUnit: 2,
        category: 'labor',
      },
    ],
    rules: [],
    modifiers: [],
    markupPercent: 0,
    taxPercent: 0,
    ...overrides,
  };
}

function makeIntake(overrides: Partial<MappedIntake> = {}): MappedIntake {
  return {
    lines: [{ itemId: 'item-a', quantity: 1 }],
    quoteModifierIds: [],
    ...overrides,
  };
}

// ─── Basic line totals ────────────────────────────────────────────────────────

describe('PricingEngine — line totals', () => {
  it('computes single line total correctly', () => {
    const kb = makeMinimalKB();
    const intake = makeIntake({ lines: [{ itemId: 'item-a', quantity: 3 }] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.lineItems).toHaveLength(1);
    expect(quote.lineItems[0]!.lineTotal).toBe(300);
    expect(quote.subtotal).toBe(300);
  });

  it('computes multiple lines and sums subtotal', () => {
    const kb = makeMinimalKB();
    const intake = makeIntake({
      lines: [
        { itemId: 'item-a', quantity: 2 },
        { itemId: 'item-b', quantity: 1 },
      ],
    });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    // item-a: 2×100=200, item-b: 1×50=50 → subtotal=250
    expect(quote.subtotal).toBe(250);
    expect(quote.lineItems).toHaveLength(2);
  });

  it('skips unknown item IDs silently', () => {
    const kb = makeMinimalKB();
    const intake = makeIntake({
      lines: [
        { itemId: 'item-a', quantity: 1 },
        { itemId: 'nonexistent', quantity: 5 },
      ],
    });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.lineItems).toHaveLength(1);
    expect(quote.subtotal).toBe(100);
  });

  it('returns zero totals for all-unknown items', () => {
    const kb = makeMinimalKB();
    const intake = makeIntake({ lines: [{ itemId: 'ghost', quantity: 1 }] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.subtotal).toBe(0);
    expect(quote.total).toBe(0);
  });
});

// ─── Labor computation ────────────────────────────────────────────────────────

describe('PricingEngine — labor', () => {
  it('computes labor from hours × rate', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'laborHourlyRate', value: 40 }],
    });
    // item-b: laborHoursPerUnit=2, quantity=3 → 6 hours × 40 = 240
    const intake = makeIntake({ lines: [{ itemId: 'item-b', quantity: 3 }] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.labor).toBe(240);
  });

  it('labor is 0 when no laborHourlyRate rule', () => {
    const kb = makeMinimalKB({ rules: [] });
    const intake = makeIntake({ lines: [{ itemId: 'item-b', quantity: 2 }] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.labor).toBe(0);
  });

  it('labor is 0 when item has no laborHoursPerUnit', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'laborHourlyRate', value: 50 }],
    });
    // item-a has no laborHoursPerUnit
    const intake = makeIntake({ lines: [{ itemId: 'item-a', quantity: 5 }] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.labor).toBe(0);
  });

  it('combines labor from multiple items', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'laborHourlyRate', value: 20 }],
    });
    // item-b: 2 hrs×qty1=2hrs; if we add another item...
    const intake = makeIntake({
      lines: [
        { itemId: 'item-b', quantity: 2 }, // 2×2=4 hrs → 80
        { itemId: 'item-a', quantity: 1 }, // no labor
      ],
    });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.labor).toBe(80); // 4 hrs × 20
  });
});

// ─── Fees ─────────────────────────────────────────────────────────────────────

describe('PricingEngine — fees', () => {
  it('adds callOutFee to fees', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'callOutFee', value: 80 }],
    });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(80);
  });

  it('adds distanceFee to fees', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'distanceFee', value: 30 }],
    });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(30);
  });

  it('adds callOutFee + distanceFee', () => {
    const kb = makeMinimalKB({
      rules: [
        { kind: 'callOutFee', value: 80 },
        { kind: 'distanceFee', value: 30 },
      ],
    });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(110);
  });

  it('no fees when no fee rules', () => {
    const kb = makeMinimalKB({ rules: [] });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(0);
  });
});

// ─── Minimum charge ───────────────────────────────────────────────────────────

describe('PricingEngine — minimumCharge', () => {
  it('bumps fees when total is below minimum', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'minimumCharge', value: 500 }],
    });
    // item-a: 1×100=100, no labor, no fees → total=100 < 500 → fees adjusted to 400
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(400);
    expect(quote.total).toBeGreaterThanOrEqual(500);
  });

  it('does not adjust when total already meets minimum', () => {
    const kb = makeMinimalKB({
      rules: [{ kind: 'minimumCharge', value: 50 }],
    });
    // item-a: 1×100=100 ≥ 50 → no fee adjustment
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.fees).toBe(0);
    expect(quote.subtotal).toBe(100);
  });

  it('does not apply when minimumCharge rule absent', () => {
    const kb = makeMinimalKB({ rules: [] });
    const quote = compute(kb, makeIntake({ lines: [{ itemId: 'item-a', quantity: 1 }] }), 'en', FIXED_DATE);
    expect(quote.fees).toBe(0);
  });
});

// ─── Modifiers ────────────────────────────────────────────────────────────────

describe('PricingEngine — modifiers', () => {
  it('applies percentage discount modifier', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'discount',
        label: { en: 'Discount', it: 'Sconto', sq: 'Zbritje' },
        type: 'percentage',
        value: -10,
      }],
    });
    const intake = makeIntake({ quoteModifierIds: ['discount'] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    // subtotal=100, modifier=-10% of 100=-10 → modifiersTotal=-10
    expect(quote.modifiersTotal).toBe(-10);
    expect(quote.modifiersApplied).toHaveLength(1);
  });

  it('applies flat surcharge modifier', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'surcharge',
        label: { en: 'Surcharge', it: 'Supplemento', sq: 'Shtesë' },
        type: 'flat',
        value: 50,
      }],
    });
    const intake = makeIntake({ quoteModifierIds: ['surcharge'] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersTotal).toBe(50);
  });

  it('applies conditional modifier when condition met', () => {
    const kb = makeMinimalKB({
      items: [{
        id: 'big-item',
        name: { en: 'Big', it: 'Grande', sq: 'Madh' },
        unit: 'unit',
        unitPrice: 2000,
        category: 'general',
      }],
      modifiers: [{
        id: 'large-discount',
        label: { en: 'Large discount', it: 'Sconto grande', sq: 'Zbritje e madhe' },
        type: 'percentage',
        value: -8,
        conditions: [{ field: 'subtotal', operator: 'gt', value: 1000 }],
      }],
    });
    const intake: MappedIntake = {
      lines: [{ itemId: 'big-item', quantity: 1 }],
      quoteModifierIds: ['large-discount'],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersApplied).toHaveLength(1);
    expect(quote.modifiersApplied[0]!.amount).toBe(-160); // -8% of 2000
  });

  it('skips conditional modifier when condition not met', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'large-discount',
        label: { en: 'Large discount', it: 'Sconto grande', sq: 'Zbritje e madhe' },
        type: 'percentage',
        value: -8,
        conditions: [{ field: 'subtotal', operator: 'gt', value: 5000 }],
      }],
    });
    const intake = makeIntake({ quoteModifierIds: ['large-discount'] });
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersApplied).toHaveLength(0);
    expect(quote.modifiersTotal).toBe(0);
  });

  it('handles unknown modifier IDs gracefully (no throw)', () => {
    const kb = makeMinimalKB();
    const intake = makeIntake({ quoteModifierIds: ['nonexistent-modifier'] });
    // Should not throw — unknown IDs just produce no applied modifier
    expect(() => compute(kb, intake, 'en', FIXED_DATE)).not.toThrow();
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersApplied).toHaveLength(0);
  });

  it('collects line-level modifiers', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'line-mod',
        label: { en: 'Line mod', it: 'Mod linea', sq: 'Mod rresht' },
        type: 'flat',
        value: 25,
      }],
    });
    const intake: MappedIntake = {
      lines: [{ itemId: 'item-a', quantity: 1, modifierIds: ['line-mod'] }],
      quoteModifierIds: [],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersApplied).toHaveLength(1);
    expect(quote.modifiersTotal).toBe(25);
  });

  it('applies line-level percentage modifiers only to that line total', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'line-discount',
        label: { en: 'Line discount', it: 'Sconto linea', sq: 'Zbritje rresht' },
        type: 'percentage',
        value: -10,
      }],
    });
    const intake: MappedIntake = {
      lines: [
        { itemId: 'item-a', quantity: 1, modifierIds: ['line-discount'] },
        { itemId: 'item-b', quantity: 1 },
      ],
      quoteModifierIds: [],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.subtotal).toBe(150);
    expect(quote.modifiersApplied[0]!.amount).toBe(-10);
    expect(quote.modifiersTotal).toBe(-10);
  });

  it('evaluates line-level category and quantity conditions from that line', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'bulk-general',
        label: { en: 'Bulk general', it: 'Bulk general', sq: 'Bulk general' },
        type: 'percentage',
        value: -10,
        conditions: [
          { field: 'category', operator: 'eq', value: 'general' },
          { field: 'quantity', operator: 'gte', value: 2 },
        ],
      }],
    });
    const intake: MappedIntake = {
      lines: [
        { itemId: 'item-a', quantity: 2, modifierIds: ['bulk-general'] },
        { itemId: 'item-b', quantity: 2, modifierIds: ['bulk-general'] },
      ],
      quoteModifierIds: [],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    expect(quote.modifiersApplied).toHaveLength(1);
    expect(quote.modifiersApplied[0]!.amount).toBe(-20);
  });

  it('deduplicates modifier IDs across line and quote levels', () => {
    const kb = makeMinimalKB({
      modifiers: [{
        id: 'shared-mod',
        label: { en: 'Shared', it: 'Condiviso', sq: 'Ndarë' },
        type: 'flat',
        value: 10,
      }],
    });
    const intake: MappedIntake = {
      lines: [{ itemId: 'item-a', quantity: 1, modifierIds: ['shared-mod'] }],
      quoteModifierIds: ['shared-mod'],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    // Same modifier ID appears twice but should only be applied once
    expect(quote.modifiersApplied).toHaveLength(1);
  });
});

// ─── Markup ───────────────────────────────────────────────────────────────────

describe('PricingEngine — markup', () => {
  it('computes markup as percent of pre-markup total', () => {
    const kb = makeMinimalKB({ markupPercent: 10 });
    // item-a: 100, no labor/fees/modifiers → pre-markup=100, markup=10
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.markup).toBe(10);
  });

  it('markup=0 when markupPercent=0', () => {
    const kb = makeMinimalKB({ markupPercent: 0 });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.markup).toBe(0);
  });

  it('markup applied before tax', () => {
    const kb = makeMinimalKB({ markupPercent: 10, taxPercent: 20 });
    // subtotal=100, markup=10 → post-markup=110, tax=22 → total=132
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.markup).toBe(10);
    expect(quote.tax).toBe(22);
    expect(quote.total).toBe(132);
  });
});

// ─── Tax ─────────────────────────────────────────────────────────────────────

describe('PricingEngine — tax', () => {
  it('computes tax on post-markup total', () => {
    const kb = makeMinimalKB({ taxPercent: 20 });
    // subtotal=100, no markup → post-markup=100, tax=20 → total=120
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.tax).toBe(20);
    expect(quote.total).toBe(120);
  });

  it('tax=0 when taxPercent=0', () => {
    const kb = makeMinimalKB({ taxPercent: 0 });
    const quote = compute(kb, makeIntake(), 'en', FIXED_DATE);
    expect(quote.tax).toBe(0);
  });
});

// ─── Rounding ─────────────────────────────────────────────────────────────────

describe('PricingEngine — rounding', () => {
  it('rounds all monetary values to 2 decimal places', () => {
    const kb = makeMinimalKB({
      items: [{
        id: 'fractional',
        name: { en: 'Frac', it: 'Fraz', sq: 'Frag' },
        unit: 'unit',
        unitPrice: 1 / 3,
        category: 'test',
      }],
      taxPercent: 7.5,
    });
    const intake: MappedIntake = {
      lines: [{ itemId: 'fractional', quantity: 3 }],
      quoteModifierIds: [],
    };
    const quote = compute(kb, intake, 'en', FIXED_DATE);
    // All monetary values should have at most 2 decimal places
    const checkDecimals = (n: number) => {
      const decimals = (n.toString().split('.')[1] ?? '').length;
      return decimals <= 2;
    };
    expect(checkDecimals(quote.subtotal)).toBe(true);
    expect(checkDecimals(quote.tax)).toBe(true);
    expect(checkDecimals(quote.total)).toBe(true);
  });
});

// ─── Full integration scenarios ──────────────────────────────────────────────

describe('PricingEngine — dental-clinic scenario', () => {
  it('computes full quote: 2 standard implants + 1 cleaning', () => {
    const intake: MappedIntake = {
      lines: [
        { itemId: 'implant-standard', quantity: 2 },
        { itemId: 'cleaning', quantity: 1 },
      ],
      quoteModifierIds: [],
    };
    const quote = compute(dentalClinicKB, intake, 'en', FIXED_DATE);

    // implant-standard: 2×450=900 + cleaning: 1×50=50 → subtotal=950
    expect(quote.subtotal).toBe(950);

    // labor: implant (2hrs×2)=4hrs + cleaning (1hr×1)=1hr → 5hrs × 40/hr = 200
    expect(quote.labor).toBe(200);

    // no fees (dental has no callOutFee)
    expect(quote.fees).toBe(0);

    // no modifiers applied
    expect(quote.modifiersApplied).toHaveLength(0);

    // no markup (markupPercent=0)
    expect(quote.markup).toBe(0);

    // the bundled practice catalog is explicitly tax-neutral demo data
    expect(quote.tax).toBe(0);

    // total: 950 item subtotal + 200 clinical services
    expect(quote.total).toBe(1150);
  });

  it('uses Italian labels', () => {
    const intake: MappedIntake = {
      lines: [{ itemId: 'implant-standard', quantity: 1 }],
      quoteModifierIds: [],
    };
    const quote = compute(dentalClinicKB, intake, 'it', FIXED_DATE);
    expect(quote.lineItems[0]!.label).toBe('Impianto Standard');
    expect(quote.language).toBe('it');
  });

  it('uses Albanian labels', () => {
    const intake: MappedIntake = {
      lines: [{ itemId: 'implant-standard', quantity: 1 }],
      quoteModifierIds: [],
    };
    const quote = compute(dentalClinicKB, intake, 'sq', FIXED_DATE);
    expect(quote.lineItems[0]!.label).toBe('Implant Standard');
  });
});
