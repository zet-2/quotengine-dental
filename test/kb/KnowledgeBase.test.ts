/**
 * Tests for KB loading and validation.
 */
import { describe, it, expect } from 'vitest';
import { loadKnowledgeBase, getItemById, getModifierById, getRuleByKind } from '../../src/kb/KnowledgeBase.js';
import { KnowledgeBaseValidationError } from '../../src/kb/KnowledgeBase.js';
import { dentalClinicKB } from '../../src/clients/dental-clinic.js';

const validRaw = {
  clientId: 'test',
  clientName: 'Test Client',
  languages: ['en', 'it'],
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
  ],
  rules: [],
  modifiers: [],
  markupPercent: 0,
  taxPercent: 20,
};

describe('loadKnowledgeBase', () => {
  it('loads valid KB successfully', () => {
    const kb = loadKnowledgeBase(validRaw);
    expect(kb.clientId).toBe('test');
    expect(kb.items).toHaveLength(1);
  });

  it('throws KnowledgeBaseValidationError for invalid config', () => {
    expect(() => loadKnowledgeBase({ ...validRaw, taxPercent: -5 }))
      .toThrow(KnowledgeBaseValidationError);
  });

  it('throws when defaultLanguage not in languages', () => {
    expect(() => loadKnowledgeBase({ ...validRaw, defaultLanguage: 'sq' }))
      .toThrow(KnowledgeBaseValidationError);
  });

  it('throws for duplicate item IDs', () => {
    expect(() => loadKnowledgeBase({
      ...validRaw,
      items: [
        { ...validRaw.items[0] },
        { ...validRaw.items[0] },
      ],
    })).toThrow(KnowledgeBaseValidationError);
  });

  it('throws for duplicate modifier IDs', () => {
    const mod = { id: 'dup', label: { en: 'D', it: 'D', sq: 'D' }, type: 'flat', value: 10 };
    expect(() => loadKnowledgeBase({ ...validRaw, modifiers: [mod, mod] }))
      .toThrow(KnowledgeBaseValidationError);
  });

  it('throws for completely invalid input', () => {
    expect(() => loadKnowledgeBase(null)).toThrow(KnowledgeBaseValidationError);
    expect(() => loadKnowledgeBase('string')).toThrow(KnowledgeBaseValidationError);
  });
});

describe('Example dental KB validates correctly', () => {
  it('dental-clinic KB is valid', () => {
    expect(dentalClinicKB.clientId).toBe('dental-clinic');
    expect(dentalClinicKB.items.length).toBeGreaterThan(0);
  });

  it('dental-clinic has expected items', () => {
    const implant = getItemById(dentalClinicKB, 'implant-standard');
    expect(implant).toBeDefined();
    expect(implant!.unitPrice).toBe(450);
  });

  it('dental-clinic has urgency-surcharge modifier', () => {
    const mod = getModifierById(dentalClinicKB, 'urgency-surcharge');
    expect(mod).toBeDefined();
    expect(mod!.type).toBe('percentage');
    expect(mod!.value).toBe(15);
  });
});

describe('getItemById', () => {
  it('returns item when found', () => {
    const kb = loadKnowledgeBase(validRaw);
    const item = getItemById(kb, 'item-a');
    expect(item).toBeDefined();
    expect(item!.id).toBe('item-a');
  });

  it('returns undefined for unknown ID', () => {
    const kb = loadKnowledgeBase(validRaw);
    expect(getItemById(kb, 'ghost')).toBeUndefined();
  });
});

describe('getModifierById', () => {
  it('returns modifier when found', () => {
    const kb = loadKnowledgeBase({
      ...validRaw,
      modifiers: [{ id: 'mod1', label: { en: 'M', it: 'M', sq: 'M' }, type: 'flat', value: 10 }],
    });
    const mod = getModifierById(kb, 'mod1');
    expect(mod).toBeDefined();
  });

  it('returns undefined for unknown ID', () => {
    const kb = loadKnowledgeBase(validRaw);
    expect(getModifierById(kb, 'ghost')).toBeUndefined();
  });
});

describe('getRuleByKind', () => {
  it('finds rule by kind', () => {
    const kb = loadKnowledgeBase({
      ...validRaw,
      rules: [{ kind: 'laborHourlyRate', value: 40 }],
    });
    const rule = getRuleByKind(kb, 'laborHourlyRate');
    expect(rule!.value).toBe(40);
  });

  it('returns undefined when not found', () => {
    const kb = loadKnowledgeBase(validRaw);
    expect(getRuleByKind(kb, 'callOutFee')).toBeUndefined();
  });
});
