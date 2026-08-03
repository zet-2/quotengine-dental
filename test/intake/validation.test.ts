/**
 * Tests for KB validation of mapped intake (model output safety).
 */
import { describe, it, expect } from 'vitest';
import { validateMappedIntakeAgainstKB } from '../../src/intake/validation.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { MappedIntake } from '../../src/domain/types.js';

describe('validateMappedIntakeAgainstKB', () => {
  const kb = dentalClinicKB;

  it('returns ok for fully valid intake', () => {
    const intake: MappedIntake = {
      lines: [{ itemId: 'implant-standard', quantity: 1 }],
      quoteModifierIds: ['urgency-surcharge'],
    };
    const result = validateMappedIntakeAgainstKB(intake, kb);
    expect(result.ok).toBe(true);
  });

  it('rejects intake with unknown item IDs', () => {
    const intake: MappedIntake = {
      lines: [
        { itemId: 'implant-standard', quantity: 1 },
        { itemId: 'made-up-item', quantity: 2 },
      ],
      quoteModifierIds: [],
    };
    const result = validateMappedIntakeAgainstKB(intake, kb);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('made-up-item');
    }
  });

  it('drops unknown modifier IDs (graceful handling)', () => {
    const intake: MappedIntake = {
      lines: [{ itemId: 'cleaning', quantity: 1 }],
      quoteModifierIds: ['urgency-surcharge', 'nonexistent-modifier'],
    };
    const result = validateMappedIntakeAgainstKB(intake, kb);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.quoteModifierIds).not.toContain('nonexistent-modifier');
      expect(result.intake.quoteModifierIds).toContain('urgency-surcharge');
    }
  });

  it('drops unknown line-level modifier IDs', () => {
    const intake: MappedIntake = {
      lines: [{ itemId: 'cleaning', quantity: 1, modifierIds: ['bad-mod', 'urgency-surcharge'] }],
      quoteModifierIds: [],
    };
    const result = validateMappedIntakeAgainstKB(intake, kb);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.lines[0]!.modifierIds).not.toContain('bad-mod');
      expect(result.intake.lines[0]!.modifierIds).toContain('urgency-surcharge');
    }
  });

  it('preserves valid lines unchanged when no issues', () => {
    const intake: MappedIntake = {
      lines: [
        { itemId: 'implant-standard', quantity: 2 },
        { itemId: 'cleaning', quantity: 1 },
      ],
      quoteModifierIds: [],
    };
    const result = validateMappedIntakeAgainstKB(intake, kb);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.intake.lines).toHaveLength(2);
    }
  });
});
