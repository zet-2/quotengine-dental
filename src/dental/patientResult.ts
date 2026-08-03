import type { AppliedModifier, Currency, Language, Quote } from '../domain/types.js';
import type { CommercialEstimate } from './commercialCatalog.js';
import type { DentalQuoteResult } from './generateDentalQuote.js';
import type { PatientTargetArea } from './patientIntent.js';
import type { PriceRange } from './priceRange.js';

/**
 * Deliberately narrow projection for every patient-facing surface.
 *
 * DentalAssessment is intentionally absent: raw findings, rationales and internal
 * taxonomy belong only in the encrypted lead/admin view and evaluation tooling.
 */
export interface PatientDentalResult {
  readonly estimateKind: 'indicative_non_binding';
  readonly resultBasis: 'vision_items' | 'commercial_scenario';
  /** Patient-declared scope used by the deterministic pricing boundary. */
  readonly targetArea: PatientTargetArea | null;
  readonly consultationOnly: boolean;
  readonly requiresInPersonConfirmation: boolean;
  readonly disclaimer: string;
  readonly quote: PatientQuote | null;
  /** Reserved for compatibility; internal formatter output is never exposed publicly. */
  readonly text: null;
  readonly priceRange: PriceRange | null;
  readonly commercialEstimate: CommercialEstimate | null;
}

export interface PatientQuoteLineItem {
  readonly label: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

export type PatientAppliedModifier = Omit<AppliedModifier, 'id'>;

/** Public quote view: internal client/item/modifier IDs and mapper notes are omitted. */
export interface PatientQuote {
  readonly language: Language;
  readonly currency: Currency;
  readonly lineItems: readonly PatientQuoteLineItem[];
  readonly subtotal: number;
  readonly labor: number;
  readonly fees: number;
  readonly modifiersApplied: readonly PatientAppliedModifier[];
  readonly modifiersTotal: number;
  readonly markup: number;
  readonly tax: number;
  readonly total: number;
  readonly generatedAt: string;
}

function toPatientQuote(quote: Quote | null): PatientQuote | null {
  if (!quote) return null;
  return {
    language: quote.language,
    currency: quote.currency,
    lineItems: quote.lineItems.map((line) => ({
      label: line.label,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    subtotal: quote.subtotal,
    labor: quote.labor,
    fees: quote.fees,
    modifiersApplied: quote.modifiersApplied.map((modifier) => ({
      label: modifier.label,
      type: modifier.type,
      value: modifier.value,
      amount: modifier.amount,
    })),
    modifiersTotal: quote.modifiersTotal,
    markup: quote.markup,
    tax: quote.tax,
    total: quote.total,
    generatedAt: quote.generatedAt,
  };
}

export function toPatientDentalResult(
  result: DentalQuoteResult,
  targetArea: PatientTargetArea | null = null,
): PatientDentalResult {
  return {
    estimateKind: 'indicative_non_binding',
    resultBasis: result.resultBasis ??
      (result.commercialEstimate ? 'commercial_scenario' : 'vision_items'),
    targetArea: result.commercialEstimate?.targetArea ?? targetArea,
    consultationOnly: result.consultationOnly,
    requiresInPersonConfirmation: result.requiresClinicalConfirmation,
    disclaimer: result.disclaimer,
    quote: toPatientQuote(result.quote),
    text: null,
    priceRange: result.priceRange,
    commercialEstimate: result.commercialEstimate ?? null,
  };
}
