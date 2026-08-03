/**
 * generateDentalQuote — the dental vision pipeline.
 *
 * Flow: validate request → mapper.assess() (images+text → DentalAssessment) →
 * sanitizeAssessment (safety gate) → if nothing priceable, return consultation-only;
 * otherwise convert to MappedIntake → reuse the deterministic PricingEngine + the
 * QuoteFormatter (both UNCHANGED) → attach a non-diagnostic, localized disclaimer.
 */
import type {
  KnowledgeBase,
  Quote,
  Language,
  IntakeRequest,
} from '../domain/types.js';
import type { DentalAssessment } from './types.js';
import type { DentalVisionMapper } from './DentalVisionMapper.js';
import { IntakeRequestSchema } from '../domain/schemas.js';
import { compute } from '../pricing/PricingEngine.js';
import { renderText, renderJSON } from '../format/QuoteFormatter.js';
import { sanitizeAssessment } from './sanitizeAssessment.js';
import { assessmentToMappedIntake } from './assessmentToMappedIntake.js';
import { formatExistingRestorations } from './formatExistingRestorations.js';
import { computePriceRange, type PriceRange } from './priceRange.js';
import type { CommercialEstimate } from './commercialCatalog.js';
import type { PatientTargetArea } from './patientIntent.js';

/** Non-diagnostic, non-binding disclaimer shown with every dental estimate */
const DISCLAIMERS: Record<Language, string> = {
  it: 'Preventivo puramente indicativo e non vincolante. Non è una diagnosi. Da confermare in consulenza clinica con il dentista.',
  en: 'Purely indicative, non-binding estimate. This is not a diagnosis. To be confirmed in a clinical consultation with the dentist.',
  sq: 'Ofertë thjesht orientuese dhe jo-detyruese. Nuk është diagnozë. Të konfirmohet në një konsultë klinike me dentistin.',
};

/** Localized labels for the indicative range summary line */
const RANGE_LABELS: Record<Language, { readonly label: string; readonly implants: string; readonly confirm: string }> = {
  it: { label: 'Stima indicativa', implants: 'impianti', confirm: 'da confermare in consulenza' },
  en: { label: 'Indicative estimate', implants: 'implants', confirm: 'to be confirmed at consultation' },
  sq: { label: 'Vlerësim orientues', implants: 'implante', confirm: "për t'u konfirmuar në konsultë" },
};

function buildRangeLine(range: PriceRange, currency: string, language: Language): string {
  const l = RANGE_LABELS[language] ?? RANGE_LABELS.en;
  const low = range.totalRange.low.toFixed(2);
  const high = range.totalRange.high.toFixed(2);
  return `${l.label}: ${currency} ${low} – ${currency} ${high}  (≈ ${range.implantRange.low}–${range.implantRange.high} ${l.implants}, ${l.confirm})`;
}

export interface DentalQuoteResult {
  readonly resultBasis: 'vision_items' | 'commercial_scenario';
  /** Null only for a patient-declared commercial scenario that does not run vision inference. */
  readonly assessment: DentalAssessment | null;
  /** Always true — the estimate is never a final plan */
  readonly requiresClinicalConfirmation: boolean;
  readonly disclaimer: string;
  /** True when no priceable treatments remained after the safety gate */
  readonly consultationOnly: boolean;
  readonly quote: Quote | null;
  readonly text: string | null;
  readonly json: object | null;
  /** Indicative € + implant range driven by implant-count uncertainty (null when no implants) */
  readonly priceRange: PriceRange | null;
  /** Populated only for a versioned commercial scenario outside the clinical item KB. */
  readonly commercialEstimate: CommercialEstimate | null;
}

export interface VisionDentalQuoteResult extends DentalQuoteResult {
  readonly resultBasis: 'vision_items';
  readonly assessment: DentalAssessment;
  readonly commercialEstimate: null;
}

export interface DentalQuoteOptions {
  /** Deterministic commercial scope declared by the patient, never inferred by the model. */
  readonly targetArea?: PatientTargetArea;
}

export class DentalQuoteError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DentalQuoteError';
    this.cause = cause;
  }
}

export async function generateDentalQuote(
  kb: KnowledgeBase,
  rawRequest: unknown,
  mapper: DentalVisionMapper,
  language?: Language,
  options: DentalQuoteOptions = {},
): Promise<VisionDentalQuoteResult> {
  // 1. Validate the intake request
  const parseResult = IntakeRequestSchema.safeParse(rawRequest);
  if (!parseResult.success) {
    const details = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new DentalQuoteError(`Invalid intake request: ${details}`);
  }
  const request = parseResult.data as IntakeRequest;

  if (request.clientId !== kb.clientId) {
    throw new DentalQuoteError(
      `Client ID mismatch: request has '${request.clientId}', KB has '${kb.clientId}'`,
    );
  }

  const lang: Language = language ?? request.language;
  const disclaimer = DISCLAIMERS[lang] ?? DISCLAIMERS.en;

  // 2. Assess (images + text → structured assessment)
  let rawAssessment: DentalAssessment;
  try {
    rawAssessment = await mapper.assess(request, kb);
  } catch (err) {
    throw new DentalQuoteError(
      `Dental assessment failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // 3. Safety gate
  const assessment = sanitizeAssessment(rawAssessment, kb, options.targetArea);

  // 4. Nothing priceable → consultation only (no guessed quote)
  if (assessment.candidateTreatments.length === 0) {
    return {
      resultBasis: 'vision_items',
      assessment,
      requiresClinicalConfirmation: true,
      disclaimer,
      consultationOnly: true,
      quote: null,
      text: null,
      json: null,
      priceRange: null,
      commercialEstimate: null,
    };
  }

  // 5. Reuse the deterministic pricing core + formatter (unchanged)
  const mapped = assessmentToMappedIntake(assessment);
  const quote = compute(kb, mapped, lang);
  const existingNote = formatExistingRestorations(assessment.existingRestorations, lang);
  const priceRange = computePriceRange(kb, mapped, lang);
  const rangeLine = priceRange ? buildRangeLine(priceRange, kb.currency, lang) : null;

  const text = [rangeLine, renderText(quote), existingNote, `⚠ ${disclaimer}`]
    .filter((part): part is string => part !== null)
    .join('\n\n');

  return {
    resultBasis: 'vision_items',
    assessment,
    requiresClinicalConfirmation: true,
    disclaimer,
    consultationOnly: false,
    quote,
    text,
    json: renderJSON(quote),
    priceRange,
    commercialEstimate: null,
  };
}
