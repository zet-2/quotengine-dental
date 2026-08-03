/**
 * QuoteFormatter — renders a Quote as human-readable text and structured JSON.
 * Supports it/sq/en languages. Pure functions, no side effects.
 */
import type { Quote, Language } from '../domain/types.js';

const LABELS: Record<Language, Record<string, string>> = {
  en: {
    quote: 'QUOTE',
    lineItems: 'Line Items',
    item: 'Item',
    qty: 'Qty',
    unitPrice: 'Unit Price',
    lineTotal: 'Line Total',
    subtotal: 'Subtotal',
    labor: 'Clinical services',
    fees: 'Fees',
    modifiers: 'Adjustments',
    markup: 'Markup',
    tax: 'Tax',
    total: 'TOTAL',
    notes: 'Notes',
    generatedAt: 'Generated at',
    currency: 'Currency',
  },
  it: {
    quote: 'PREVENTIVO',
    lineItems: 'Voci',
    item: 'Voce',
    qty: 'Qtà',
    unitPrice: 'Prezzo unitario',
    lineTotal: 'Totale riga',
    subtotal: 'Subtotale',
    labor: 'Prestazioni cliniche',
    fees: 'Costi fissi',
    modifiers: 'Rettifiche',
    markup: 'Ricarico',
    tax: 'IVA',
    total: 'TOTALE',
    notes: 'Note',
    generatedAt: 'Generato il',
    currency: 'Valuta',
  },
  sq: {
    quote: 'OFERTË',
    lineItems: 'Zërat',
    item: 'Zë',
    qty: 'Sas.',
    unitPrice: 'Çmimi/njësi',
    lineTotal: 'Total rresht',
    subtotal: 'Nëntotali',
    labor: 'Shërbime klinike',
    fees: 'Tarifa fikse',
    modifiers: 'Rregullimet',
    markup: 'Marzhi',
    tax: 'TVSH',
    total: 'TOTALI',
    notes: 'Shënime',
    generatedAt: 'Gjeneruar më',
    currency: 'Monedha',
  },
};

function formatAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

function pad(s: string, length: number): string {
  return s.padEnd(length, ' ');
}

/** Render a Quote as a plain-text table */
export function renderText(quote: Quote): string {
  const lang = quote.language;
  const lbl = LABELS[lang] ?? LABELS.en;
  const cur = quote.currency;
  const fmt = (n: number) => formatAmount(n, cur);
  const separator = '─'.repeat(60);

  const lines: string[] = [
    `${lbl['quote']}`,
    separator,
    `${lbl['generatedAt']}: ${quote.generatedAt}`,
    `${lbl['currency']}: ${cur}`,
    '',
    `${pad(lbl['item'] ?? 'Item', 28)} ${pad(lbl['qty'] ?? 'Qty', 6)} ${pad(lbl['unitPrice'] ?? 'Unit Price', 10)} ${lbl['lineTotal'] ?? 'Line Total'}`,
    '─'.repeat(60),
  ];

  for (const li of quote.lineItems) {
    lines.push(
      `${pad(li.label, 28)} ${pad(String(li.quantity), 6)} ${pad(fmt(li.unitPrice), 10)} ${fmt(li.lineTotal)}`,
    );
  }

  lines.push(separator);
  lines.push(`${pad(lbl['subtotal'] ?? 'Subtotal', 46)} ${fmt(quote.subtotal)}`);

  if (quote.labor > 0) {
    lines.push(`${pad(lbl['labor'] ?? 'Labor', 46)} ${fmt(quote.labor)}`);
  }
  if (quote.fees > 0) {
    lines.push(`${pad(lbl['fees'] ?? 'Fees', 46)} ${fmt(quote.fees)}`);
  }

  for (const mod of quote.modifiersApplied) {
    const sign = mod.amount >= 0 ? '+' : '';
    lines.push(`${pad(`  ${mod.label}`, 46)} ${sign}${fmt(mod.amount)}`);
  }

  if (quote.markup > 0) {
    lines.push(`${pad(lbl['markup'] ?? 'Markup', 46)} ${fmt(quote.markup)}`);
  }
  if (quote.tax > 0) {
    lines.push(`${pad(lbl['tax'] ?? 'Tax', 46)} ${fmt(quote.tax)}`);
  }

  lines.push('═'.repeat(60));
  lines.push(`${pad(lbl['total'] ?? 'TOTAL', 46)} ${fmt(quote.total)}`);

  if (quote.notes) {
    lines.push('');
    lines.push(`${lbl['notes']}: ${quote.notes}`);
  }

  return lines.join('\n');
}

/** Render a Quote as structured JSON (already an object, but this gives a clean shape) */
export function renderJSON(quote: Quote): object {
  return {
    clientId: quote.clientId,
    language: quote.language,
    currency: quote.currency,
    generatedAt: quote.generatedAt,
    lineItems: quote.lineItems.map((li) => ({
      itemId: li.itemId,
      label: li.label,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: li.lineTotal,
    })),
    summary: {
      subtotal: quote.subtotal,
      labor: quote.labor,
      fees: quote.fees,
      modifiers: quote.modifiersApplied,
      modifiersTotal: quote.modifiersTotal,
      markup: quote.markup,
      tax: quote.tax,
      total: quote.total,
    },
    notes: quote.notes ?? null,
  };
}
