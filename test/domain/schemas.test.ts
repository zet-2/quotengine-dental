/**
 * Tests for zod schema validation of domain types.
 */
import { describe, it, expect } from 'vitest';
import {
  KnowledgeBaseSchema,
  IntakeRequestSchema,
  MappedIntakeSchema,
  IntakeImageSchema,
} from '../../src/domain/schemas.js';

describe('KnowledgeBaseSchema', () => {
  const validKB = {
    clientId: 'test',
    clientName: 'Test',
    languages: ['en'],
    defaultLanguage: 'en',
    currency: 'EUR',
    items: [{
      id: 'item1',
      name: { en: 'Item', it: 'Voce', sq: 'Zë' },
      unit: 'unit',
      unitPrice: 100,
      category: 'cat',
    }],
    rules: [],
    modifiers: [],
    markupPercent: 0,
    taxPercent: 0,
  };

  it('validates a correct KB', () => {
    expect(KnowledgeBaseSchema.safeParse(validKB).success).toBe(true);
  });

  it('rejects missing clientId', () => {
    const { clientId: _c, ...rest } = validKB;
    expect(KnowledgeBaseSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty items array', () => {
    expect(KnowledgeBaseSchema.safeParse({ ...validKB, items: [] }).success).toBe(false);
  });

  it('rejects negative markupPercent', () => {
    expect(KnowledgeBaseSchema.safeParse({ ...validKB, markupPercent: -1 }).success).toBe(false);
  });

  it('rejects invalid language', () => {
    expect(KnowledgeBaseSchema.safeParse({ ...validKB, languages: ['fr'] }).success).toBe(false);
  });

  it('rejects invalid currency (too long)', () => {
    expect(KnowledgeBaseSchema.safeParse({ ...validKB, currency: 'EURO' }).success).toBe(false);
  });

  it('rejects invalid unit', () => {
    expect(KnowledgeBaseSchema.safeParse({
      ...validKB,
      items: [{ ...validKB.items[0], unit: 'liter' }],
    }).success).toBe(false);
  });

  it('rejects negative unitPrice', () => {
    expect(KnowledgeBaseSchema.safeParse({
      ...validKB,
      items: [{ ...validKB.items[0]!, unitPrice: -5 }],
    }).success).toBe(false);
  });
});

describe('IntakeRequestSchema', () => {
  const validIntake = {
    clientId: 'test',
    language: 'en',
    freeText: 'I need 3 implants',
  };

  it('validates correct intake', () => {
    expect(IntakeRequestSchema.safeParse(validIntake).success).toBe(true);
  });

  it('rejects empty freeText', () => {
    expect(IntakeRequestSchema.safeParse({ ...validIntake, freeText: '' }).success).toBe(false);
  });

  it('rejects invalid language', () => {
    expect(IntakeRequestSchema.safeParse({ ...validIntake, language: 'de' }).success).toBe(false);
  });

  it('accepts optional requestedModifierIds', () => {
    const r = IntakeRequestSchema.safeParse({
      ...validIntake,
      requestedModifierIds: ['mod1'],
    });
    expect(r.success).toBe(true);
  });
});

describe('MappedIntakeSchema', () => {
  const validMapped = {
    lines: [{ itemId: 'item1', quantity: 2 }],
    quoteModifierIds: [],
  };

  it('validates correct mapped intake', () => {
    expect(MappedIntakeSchema.safeParse(validMapped).success).toBe(true);
  });

  it('rejects empty lines array', () => {
    expect(MappedIntakeSchema.safeParse({ ...validMapped, lines: [] }).success).toBe(false);
  });

  it('rejects zero quantity', () => {
    expect(MappedIntakeSchema.safeParse({
      ...validMapped,
      lines: [{ itemId: 'x', quantity: 0 }],
    }).success).toBe(false);
  });

  it('accepts optional notes', () => {
    const r = MappedIntakeSchema.safeParse({ ...validMapped, notes: 'hi' });
    expect(r.success).toBe(true);
  });
});

describe('IntakeImageSchema', () => {
  const validImage = { kind: 'panoramic_xray', mediaType: 'image/jpeg', data: 'base64data' };

  it('validates a correct image', () => {
    expect(IntakeImageSchema.safeParse(validImage).success).toBe(true);
  });

  it('rejects an invalid kind', () => {
    expect(IntakeImageSchema.safeParse({ ...validImage, kind: 'mri' }).success).toBe(false);
  });

  it('rejects an unsupported mediaType', () => {
    expect(IntakeImageSchema.safeParse({ ...validImage, mediaType: 'image/gif' }).success).toBe(false);
  });

  it('rejects empty data', () => {
    expect(IntakeImageSchema.safeParse({ ...validImage, data: '' }).success).toBe(false);
  });
});

describe('IntakeRequestSchema with images', () => {
  const base = { clientId: 'dental-clinic', language: 'en', freeText: 'missing upper teeth' };

  it('accepts an optional images array', () => {
    const r = IntakeRequestSchema.safeParse({
      ...base,
      images: [{ kind: 'panoramic_xray', mediaType: 'image/jpeg', data: 'abc' }],
    });
    expect(r.success).toBe(true);
  });

  it('still validates without images (backwards compatible)', () => {
    expect(IntakeRequestSchema.safeParse(base).success).toBe(true);
  });

  it('rejects malformed image entries', () => {
    const r = IntakeRequestSchema.safeParse({ ...base, images: [{ kind: 'photo' }] });
    expect(r.success).toBe(false);
  });
});
