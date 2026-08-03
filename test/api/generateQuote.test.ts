/**
 * Integration tests for generateQuote — full pipeline via MockIntakeMapper.
 * No API key required.
 */
import { describe, it, expect } from 'vitest';
import { generateQuote, QuoteGenerationError } from '../../src/api/generateQuote.js';
import { MockIntakeMapper } from '../../src/intake/MockIntakeMapper.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';
import type { MappedIntake } from '../../src/domain/types.js';

describe('generateQuote — dental-clinic', () => {
  const mapper = new MockIntakeMapper({
    'implant request': {
      lines: [
        { itemId: 'implant-standard', quantity: 2 },
        { itemId: 'cleaning', quantity: 1 },
      ],
      quoteModifierIds: [],
    } satisfies MappedIntake,
  });

  it('generates a full quote successfully', async () => {
    const result = await generateQuote(
      dentalClinicKB,
      { clientId: 'dental-clinic', language: 'en', freeText: 'implant request' },
      mapper,
    );
    expect(result.quote.clientId).toBe('dental-clinic');
    expect(result.quote.total).toBeGreaterThan(0);
    expect(result.text).toContain('QUOTE');
    expect(result.json).toBeDefined();
  });

  it('respects language override', async () => {
    const result = await generateQuote(
      dentalClinicKB,
      { clientId: 'dental-clinic', language: 'en', freeText: 'implant request' },
      mapper,
      'it',
    );
    expect(result.quote.language).toBe('it');
    expect(result.text).toContain('PREVENTIVO');
  });

  it('throws QuoteGenerationError on invalid request', async () => {
    await expect(
      generateQuote(dentalClinicKB, { clientId: '', language: 'en', freeText: '' }, mapper),
    ).rejects.toThrow(QuoteGenerationError);
  });

  it('throws when clientId does not match KB', async () => {
    await expect(
      generateQuote(
        dentalClinicKB,
        { clientId: 'wrong-client', language: 'en', freeText: 'implant request' },
        mapper,
      ),
    ).rejects.toThrow(QuoteGenerationError);
  });

  it('throws QuoteGenerationError on completely invalid request shape', async () => {
    await expect(
      generateQuote(dentalClinicKB, null, mapper),
    ).rejects.toThrow(QuoteGenerationError);
  });
});

describe('generateQuote — mapper error handling', () => {
  it('wraps mapper errors in QuoteGenerationError', async () => {
    const failingMapper = {
      map: async () => { throw new Error('LLM error'); },
    };
    await expect(
      generateQuote(
        dentalClinicKB,
        { clientId: 'dental-clinic', language: 'en', freeText: 'anything' },
        failingMapper,
      ),
    ).rejects.toThrow(QuoteGenerationError);
  });
});
