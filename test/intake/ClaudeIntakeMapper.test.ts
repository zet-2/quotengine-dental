/**
 * Tests for the pure parsing/validation core of ClaudeIntakeMapper.
 * (The network call itself is thin glue, verified live with an API key.)
 * Mirrors the dental vision mapper tests: the model's tool output is
 * zod-validated and KB-validated before it is ever trusted.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  parseIntakeToolResponse,
  type IntakeToolResponse,
} from '../../src/intake/ClaudeIntakeMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

function toolResponse(input: unknown): IntakeToolResponse {
  return {
    content: [{ type: 'tool_use', input }],
    stop_reason: 'tool_use',
  };
}

describe('parseIntakeToolResponse', () => {
  it('parses and KB-validates a well-formed tool response', () => {
    const intake = parseIntakeToolResponse(
      toolResponse({
        lines: [{ itemId: 'implant-standard', quantity: 2 }],
        quoteModifierIds: [],
        notes: 'two standard implants',
      }),
      dentalClinicKB,
    );
    expect(intake.lines).toEqual([{ itemId: 'implant-standard', quantity: 2 }]);
    expect(intake.notes).toBe('two standard implants');
  });

  it('throws when the model did not call the tool', () => {
    const response: IntakeToolResponse = {
      content: [{ type: 'text' }],
      stop_reason: 'end_turn',
    };
    expect(() => parseIntakeToolResponse(response, dentalClinicKB)).toThrow(
      /did not call the select_quote_items tool.*end_turn/,
    );
  });

  it('throws on schema-invalid tool output (malformed lines)', () => {
    expect(() =>
      parseIntakeToolResponse(toolResponse({ lines: 'not-an-array', quoteModifierIds: [] }), dentalClinicKB),
    ).toThrow(/invalid tool output schema/);
  });

  it('throws on schema-invalid tool output (non-positive quantity)', () => {
    expect(() =>
      parseIntakeToolResponse(
        toolResponse({ lines: [{ itemId: 'cleaning', quantity: 0 }], quoteModifierIds: [] }),
        dentalClinicKB,
      ),
    ).toThrow(/invalid tool output schema/);
  });

  it('rejects invented item IDs (model must not invent items)', () => {
    expect(() =>
      parseIntakeToolResponse(
        toolResponse({ lines: [{ itemId: 'gold-tooth-9000', quantity: 1 }], quoteModifierIds: [] }),
        dentalClinicKB,
      ),
    ).toThrow(/gold-tooth-9000/);
  });

  it('drops unknown modifier IDs instead of failing the quote', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const intake = parseIntakeToolResponse(
        toolResponse({
          lines: [{ itemId: 'cleaning', quantity: 1, modifierIds: ['not-a-real-modifier'] }],
          quoteModifierIds: ['also-not-real'],
        }),
        dentalClinicKB,
      );
      expect(intake.lines).toEqual([{ itemId: 'cleaning', quantity: 1 }]);
      expect(intake.quoteModifierIds).toEqual([]);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('uses the first tool_use block when several content blocks exist', () => {
    const response: IntakeToolResponse = {
      content: [
        { type: 'text' },
        {
          type: 'tool_use',
          input: { lines: [{ itemId: 'cleaning', quantity: 1 }], quoteModifierIds: [] },
        },
      ],
      stop_reason: 'tool_use',
    };
    const intake = parseIntakeToolResponse(response, dentalClinicKB);
    expect(intake.lines[0]?.itemId).toBe('cleaning');
  });
});
