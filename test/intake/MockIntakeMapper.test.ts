/**
 * Tests for MockIntakeMapper — verifies the dental demo works offline.
 */
import { describe, it, expect } from 'vitest';
import { MockIntakeMapper } from '../../src/intake/MockIntakeMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { MappedIntake } from '../../src/domain/types.js';

describe('MockIntakeMapper', () => {
  it('returns a valid MappedIntake for dental-clinic (default)', async () => {
    const mapper = new MockIntakeMapper();
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: 'I need implants' },
      dentalClinicKB,
    );
    expect(result.lines.length).toBeGreaterThan(0);
    // All itemIds must exist in the KB
    const itemIds = new Set(dentalClinicKB.items.map(i => i.id));
    for (const line of result.lines) {
      expect(itemIds.has(line.itemId)).toBe(true);
    }
  });

  it('maps common dental demo text to matching items and quantities', async () => {
    const mapper = new MockIntakeMapper();
    const result = await mapper.map(
      {
        clientId: 'dental-clinic',
        language: 'en',
        freeText: '2 standard implants and a cleaning session',
      },
      dentalClinicKB,
    );
    expect(result.lines).toEqual([
      { itemId: 'implant-standard', quantity: 2 },
      { itemId: 'cleaning', quantity: 1 },
    ]);
  });

  it('maps specific crown material instead of falling back to implants', async () => {
    const mapper = new MockIntakeMapper();
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: '2 zirconia crowns' },
      dentalClinicKB,
    );
    expect(result.lines).toEqual([{ itemId: 'crown-zirconia', quantity: 2 }]);
  });

  it('uses exact freeText override when provided', async () => {
    const override: MappedIntake = {
      lines: [{ itemId: 'crown-porcelain', quantity: 2 }],
      quoteModifierIds: [],
    };
    const mapper = new MockIntakeMapper({ 'two crowns': override });
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: 'two crowns' },
      dentalClinicKB,
    );
    expect(result.lines[0]!.itemId).toBe('crown-porcelain');
    expect(result.lines[0]!.quantity).toBe(2);
  });

  it('matches fuzzy override when freeText contains key', async () => {
    const override: MappedIntake = {
      lines: [{ itemId: 'veneer-composite', quantity: 4 }],
      quoteModifierIds: [],
    };
    const mapper = new MockIntakeMapper({ 'veneers': override });
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: 'I want 4 composite veneers please' },
      dentalClinicKB,
    );
    expect(result.lines[0]!.itemId).toBe('veneer-composite');
  });

  it('includes notes in default response', async () => {
    const mapper = new MockIntakeMapper();
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: 'anything' },
      dentalClinicKB,
    );
    expect(result.notes).toContain('[Mock]');
  });

  it('handles override with valid modifier IDs', async () => {
    const override: MappedIntake = {
      lines: [{ itemId: 'implant-standard', quantity: 3 }],
      quoteModifierIds: ['urgency-surcharge'],
    };
    const mapper = new MockIntakeMapper({ 'urgent implants': override });
    const result = await mapper.map(
      { clientId: 'dental-clinic', language: 'en', freeText: 'urgent implants' },
      dentalClinicKB,
    );
    expect(result.quoteModifierIds).toContain('urgency-surcharge');
  });

  it('rejects override with invalid item IDs', async () => {
    const override: MappedIntake = {
      lines: [{ itemId: 'nonexistent-item', quantity: 1 }],
      quoteModifierIds: [],
    };
    const mapper = new MockIntakeMapper({ 'bad item': override });
    await expect(
      mapper.map(
        { clientId: 'dental-clinic', language: 'en', freeText: 'bad item' },
        dentalClinicKB,
      ),
    ).rejects.toThrow();
  });
});
