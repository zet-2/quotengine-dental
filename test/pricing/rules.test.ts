/**
 * Unit tests for pricing/rules.ts (pure functions).
 * Covers: round2, buildLineItem, computeLaborHours,
 *         evaluateCondition, shouldApplyModifier, computeModifierAmount, applyModifiers.
 */
import { describe, it, expect } from 'vitest';
import {
  round2,
  buildLineItem,
  computeLaborHours,
  evaluateCondition,
  shouldApplyModifier,
  computeModifierAmount,
  applyModifiers,
} from '../../src/pricing/rules.js';
import type { Modifier, MappedLineSelection } from '../../src/domain/types.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

// ─── round2 ───────────────────────────────────────────────────────────────────

describe('round2', () => {
  it('rounds 1.005 to 1.01 (epsilon correction)', () => {
    expect(round2(1.005)).toBe(1.01);
  });

  it('rounds 1.004 to 1', () => {
    expect(round2(1.004)).toBe(1);
  });

  it('rounds integers unchanged', () => {
    expect(round2(100)).toBe(100);
    expect(round2(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(round2(-1.005)).toBe(-1);
  });

  it('rounds to 2 decimal places', () => {
    expect(round2(10.999)).toBe(11);
    expect(round2(10.994)).toBe(10.99);
  });
});

// ─── buildLineItem ─────────────────────────────────────────────────────────────

describe('buildLineItem', () => {
  const kb = dentalClinicKB;

  it('returns null for unknown itemId', () => {
    const sel: MappedLineSelection = { itemId: 'nonexistent', quantity: 1 };
    expect(buildLineItem(sel, kb, 'en')).toBeNull();
  });

  it('builds a LineItem with correct lineTotal', () => {
    // implant-standard: unitPrice=450, quantity=2 → lineTotal=900
    const sel: MappedLineSelection = { itemId: 'implant-standard', quantity: 2 };
    const li = buildLineItem(sel, kb, 'en');
    expect(li).not.toBeNull();
    expect(li!.lineTotal).toBe(900);
    expect(li!.unitPrice).toBe(450);
    expect(li!.quantity).toBe(2);
    expect(li!.itemId).toBe('implant-standard');
  });

  it('uses correct language label', () => {
    const sel: MappedLineSelection = { itemId: 'implant-standard', quantity: 1 };
    const en = buildLineItem(sel, kb, 'en');
    const it = buildLineItem(sel, kb, 'it');
    const sq = buildLineItem(sel, kb, 'sq');
    expect(en!.label).toBe('Standard Implant');
    expect(it!.label).toBe('Impianto Standard');
    expect(sq!.label).toBe('Implant Standard');
  });

  it('captures laborHoursPerUnit', () => {
    const sel: MappedLineSelection = { itemId: 'implant-standard', quantity: 1 };
    const li = buildLineItem(sel, kb, 'en');
    expect(li!.laborHoursPerUnit).toBe(2);
  });

  it('defaults laborHoursPerUnit to 0 when not set', () => {
    const noLaborItem = {
      ...kb.items[0]!,
      id: 'service-without-hourly-labor',
      laborHoursPerUnit: undefined,
    };
    const kbWithNoLaborItem = { ...kb, items: [...kb.items, noLaborItem] };
    const sel: MappedLineSelection = { itemId: noLaborItem.id, quantity: 3 };
    const li = buildLineItem(sel, kbWithNoLaborItem, 'en');
    expect(li!.laborHoursPerUnit).toBe(0);
  });

  it('computes lineTotal precisely for fractional quantities', () => {
    // cleaning: unitPrice=50, quantity=2.5 → 125
    const sel: MappedLineSelection = { itemId: 'cleaning', quantity: 2.5 };
    const li = buildLineItem(sel, kb, 'en');
    expect(li!.lineTotal).toBe(125);
  });

});

// ─── computeLaborHours ────────────────────────────────────────────────────────

describe('computeLaborHours', () => {
  it('returns 0 for empty array', () => {
    expect(computeLaborHours([])).toBe(0);
  });

  it('sums quantity × laborHoursPerUnit across all items', () => {
    const items = [
      { itemId: 'a', label: 'A', quantity: 2, unitPrice: 100, laborHoursPerUnit: 3, lineTotal: 200 },
      { itemId: 'b', label: 'B', quantity: 1, unitPrice: 50, laborHoursPerUnit: 1.5, lineTotal: 50 },
    ];
    // 2×3 + 1×1.5 = 7.5
    expect(computeLaborHours(items)).toBe(7.5);
  });

  it('handles zero laborHoursPerUnit', () => {
    const items = [
      { itemId: 'a', label: 'A', quantity: 5, unitPrice: 30, laborHoursPerUnit: 0, lineTotal: 150 },
    ];
    expect(computeLaborHours(items)).toBe(0);
  });
});

// ─── evaluateCondition ────────────────────────────────────────────────────────

describe('evaluateCondition', () => {
  it('eq: matches string equality', () => {
    expect(evaluateCondition({ field: 'category', operator: 'eq', value: 'implants' }, { category: 'implants' })).toBe(true);
    expect(evaluateCondition({ field: 'category', operator: 'eq', value: 'implants' }, { category: 'crowns' })).toBe(false);
  });

  it('gt: greater than', () => {
    expect(evaluateCondition({ field: 'subtotal', operator: 'gt', value: 1000 }, { subtotal: 1001 })).toBe(true);
    expect(evaluateCondition({ field: 'subtotal', operator: 'gt', value: 1000 }, { subtotal: 1000 })).toBe(false);
  });

  it('lt: less than', () => {
    expect(evaluateCondition({ field: 'quantity', operator: 'lt', value: 5 }, { quantity: 3 })).toBe(true);
    expect(evaluateCondition({ field: 'quantity', operator: 'lt', value: 5 }, { quantity: 5 })).toBe(false);
  });

  it('gte: greater than or equal', () => {
    expect(evaluateCondition({ field: 'subtotal', operator: 'gte', value: 1350 }, { subtotal: 1350 })).toBe(true);
    expect(evaluateCondition({ field: 'subtotal', operator: 'gte', value: 1350 }, { subtotal: 1349 })).toBe(false);
  });

  it('lte: less than or equal', () => {
    expect(evaluateCondition({ field: 'quantity', operator: 'lte', value: 10 }, { quantity: 10 })).toBe(true);
    expect(evaluateCondition({ field: 'quantity', operator: 'lte', value: 10 }, { quantity: 11 })).toBe(false);
  });

  it('returns false when field not in context', () => {
    expect(evaluateCondition({ field: 'category', operator: 'eq', value: 'x' }, {})).toBe(false);
    expect(evaluateCondition({ field: 'quantity', operator: 'gt', value: 1 }, {})).toBe(false);
  });

  it('returns false for unknown operator', () => {
    // @ts-expect-error - testing runtime guard
    expect(evaluateCondition({ field: 'subtotal', operator: 'unknown', value: 0 }, { subtotal: 100 })).toBe(false);
  });
});

// ─── shouldApplyModifier ──────────────────────────────────────────────────────

describe('shouldApplyModifier', () => {
  const baseModifier: Modifier = {
    id: 'test',
    label: { en: 'Test', it: 'Test', sq: 'Test' },
    type: 'percentage',
    value: -10,
  };

  it('applies when no conditions', () => {
    expect(shouldApplyModifier(baseModifier, {})).toBe(true);
  });

  it('applies when all conditions pass', () => {
    const mod: Modifier = {
      ...baseModifier,
      conditions: [
        { field: 'subtotal', operator: 'gte', value: 1000 },
      ],
    };
    expect(shouldApplyModifier(mod, { subtotal: 1500 })).toBe(true);
  });

  it('does not apply when any condition fails', () => {
    const mod: Modifier = {
      ...baseModifier,
      conditions: [
        { field: 'subtotal', operator: 'gte', value: 1000 },
        { field: 'category', operator: 'eq', value: 'implants' },
      ],
    };
    expect(shouldApplyModifier(mod, { subtotal: 1500, category: 'crowns' })).toBe(false);
  });

  it('applies when empty conditions array', () => {
    const mod: Modifier = { ...baseModifier, conditions: [] };
    expect(shouldApplyModifier(mod, {})).toBe(true);
  });
});

// ─── computeModifierAmount ────────────────────────────────────────────────────

describe('computeModifierAmount', () => {
  const makeModifier = (type: 'percentage' | 'flat', value: number): Modifier => ({
    id: 'm',
    label: { en: '', it: '', sq: '' },
    type,
    value,
  });

  it('percentage: amount = base * value/100', () => {
    expect(computeModifierAmount(makeModifier('percentage', -10), 1000)).toBe(-100);
    expect(computeModifierAmount(makeModifier('percentage', 15), 200)).toBe(30);
    expect(computeModifierAmount(makeModifier('percentage', -5), 300)).toBe(-15);
  });

  it('flat: amount = value regardless of base', () => {
    expect(computeModifierAmount(makeModifier('flat', 150), 9999)).toBe(150);
    expect(computeModifierAmount(makeModifier('flat', -50), 100)).toBe(-50);
  });

  it('rounds to 2 decimal places', () => {
    // 1/3 * 10% = 0.033... → 0.03
    expect(computeModifierAmount(makeModifier('percentage', 10), 1 / 3)).toBe(0.03);
  });
});

// ─── applyModifiers ───────────────────────────────────────────────────────────

describe('applyModifiers', () => {
  const multiImplantDiscount: Modifier = {
    id: 'multi-implant-discount',
    label: { en: 'Multi-implant discount', it: 'Sconto multi-impianto', sq: 'Zbritje multi-implant' },
    type: 'percentage',
    value: -10,
    conditions: [{ field: 'subtotal', operator: 'gte', value: 1350 }],
  };

  const urgencySurcharge: Modifier = {
    id: 'urgency-surcharge',
    label: { en: 'Urgency surcharge', it: 'Supplemento urgenza', sq: 'Shtesë urgjence' },
    type: 'percentage',
    value: 15,
  };

  it('returns empty array for empty modifiers', () => {
    expect(applyModifiers([], 1000, 'en', {})).toEqual([]);
  });

  it('applies modifier with no conditions to any base', () => {
    const result = applyModifiers([urgencySurcharge], 1000, 'en', {});
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(150);
  });

  it('skips modifier when condition not met', () => {
    const result = applyModifiers([multiImplantDiscount], 1000, 'en', { subtotal: 1000 });
    expect(result).toHaveLength(0);
  });

  it('applies modifier when condition is met', () => {
    const result = applyModifiers([multiImplantDiscount], 1350, 'en', { subtotal: 1350 });
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(-135);
  });

  it('applies multiple modifiers in order', () => {
    const result = applyModifiers(
      [urgencySurcharge, multiImplantDiscount],
      1350,
      'en',
      { subtotal: 1350 },
    );
    expect(result).toHaveLength(2);
    expect(result[0]!.amount).toBe(202.5); // 15% of 1350
    expect(result[1]!.amount).toBe(-135); // -10% of 1350
  });

  it('uses correct language label', () => {
    const result = applyModifiers([urgencySurcharge], 1000, 'it', {});
    expect(result[0]!.label).toBe('Supplemento urgenza');
  });

  it('falls back to en label for unknown language', () => {
    const result = applyModifiers([urgencySurcharge], 1000, 'fr' as 'en', {});
    expect(result[0]!.label).toBe('Urgency surcharge');
  });
});
