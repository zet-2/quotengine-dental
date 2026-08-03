/**
 * Tests for QuoteFormatter — verifies text and JSON rendering.
 */
import { describe, it, expect } from 'vitest';
import { renderText, renderJSON } from '../../src/format/QuoteFormatter.js';
import type { Quote } from '../../src/domain/types.js';

const baseQuote: Quote = {
  clientId: 'test',
  language: 'en',
  currency: 'EUR',
  lineItems: [
    {
      itemId: 'item-a',
      label: 'Standard Implant',
      quantity: 2,
      unitPrice: 450,
      laborHoursPerUnit: 2,
      lineTotal: 900,
    },
  ],
  subtotal: 900,
  labor: 80,
  fees: 0,
  modifiersApplied: [],
  modifiersTotal: 0,
  markup: 0,
  tax: 196,
  total: 1176,
  generatedAt: '2026-05-25T00:00:00.000Z',
  notes: 'Quote valid for 30 days.',
};

describe('renderText', () => {
  it('includes QUOTE header', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('QUOTE');
  });

  it('includes item label', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('Standard Implant');
  });

  it('includes line total', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('900.00');
  });

  it('includes total', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('1176.00');
  });

  it('includes notes', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('Quote valid for 30 days.');
  });

  it('renders in Italian', () => {
    const quote: Quote = { ...baseQuote, language: 'it' };
    const text = renderText(quote);
    expect(text).toContain('PREVENTIVO');
    expect(text).toContain('TOTALE');
    expect(text).toContain('IVA');
  });

  it('renders in Albanian', () => {
    const quote: Quote = { ...baseQuote, language: 'sq' };
    const text = renderText(quote);
    expect(text).toContain('OFERTË');
    expect(text).toContain('TOTALI');
    expect(text).toContain('TVSH');
  });

  it('shows modifiers with sign', () => {
    const quote: Quote = {
      ...baseQuote,
      modifiersApplied: [
        {
          id: 'urgency',
          label: 'Urgency surcharge',
          type: 'percentage',
          value: 15,
          amount: 148.2,
        },
      ],
      modifiersTotal: 148.2,
    };
    const text = renderText(quote);
    expect(text).toContain('Urgency surcharge');
    expect(text).toContain('+');
  });

  it('shows negative modifier with proper sign', () => {
    const quote: Quote = {
      ...baseQuote,
      modifiersApplied: [
        {
          id: 'discount',
          label: 'Discount',
          type: 'percentage',
          value: -10,
          amount: -90,
        },
      ],
      modifiersTotal: -90,
    };
    const text = renderText(quote);
    // negative amount starts with - not +
    expect(text).toContain('-');
    expect(text).toContain('Discount');
  });

  it('shows labor row when labor > 0', () => {
    const text = renderText(baseQuote);
    expect(text).toContain('80.00');
  });

  it('omits notes section when no notes', () => {
    const quote: Quote = { ...baseQuote, notes: undefined };
    const text = renderText(quote);
    expect(text).not.toContain('Notes:');
  });
});

describe('renderJSON', () => {
  it('returns an object with correct shape', () => {
    const json = renderJSON(baseQuote) as Record<string, unknown>;
    expect(json).toHaveProperty('clientId', 'test');
    expect(json).toHaveProperty('language', 'en');
    expect(json).toHaveProperty('currency', 'EUR');
    expect(json).toHaveProperty('lineItems');
    expect(json).toHaveProperty('summary');
  });

  it('summary contains all financial fields', () => {
    const json = renderJSON(baseQuote) as { summary: Record<string, unknown> };
    const summary = json.summary;
    expect(summary).toHaveProperty('subtotal', 900);
    expect(summary).toHaveProperty('labor', 80);
    expect(summary).toHaveProperty('tax', 196);
    expect(summary).toHaveProperty('total', 1176);
  });

  it('maps lineItems correctly', () => {
    const json = renderJSON(baseQuote) as { lineItems: Array<Record<string, unknown>> };
    expect(json.lineItems).toHaveLength(1);
    expect(json.lineItems[0]).toHaveProperty('itemId', 'item-a');
    expect(json.lineItems[0]).toHaveProperty('quantity', 2);
    expect(json.lineItems[0]).toHaveProperty('lineTotal', 900);
  });

  it('notes is null when missing', () => {
    const quote: Quote = { ...baseQuote, notes: undefined };
    const json = renderJSON(quote) as { notes: unknown };
    expect(json.notes).toBeNull();
  });
});
