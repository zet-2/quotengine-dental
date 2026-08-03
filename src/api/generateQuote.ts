/**
 * generateQuote — orchestrates intake → pricing → formatting.
 * This is the main entry point for the quoting pipeline.
 */
import type { KnowledgeBase, IntakeRequest, Quote, Language } from '../domain/types.js';
import type { IntakeMapper } from '../intake/IntakeMapper.js';
import { IntakeRequestSchema } from '../domain/schemas.js';
import { compute } from '../pricing/PricingEngine.js';
import { renderText, renderJSON } from '../format/QuoteFormatter.js';

export interface GenerateQuoteResult {
  readonly quote: Quote;
  readonly text: string;
  readonly json: object;
}

export class QuoteGenerationError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'QuoteGenerationError';
    this.cause = cause;
  }
}

/**
 * Full quoting pipeline:
 * 1. Validate intake request
 * 2. Map freeText → structured selections (via mapper)
 * 3. Compute quote deterministically
 * 4. Format output
 */
export async function generateQuote(
  kb: KnowledgeBase,
  rawRequest: unknown,
  mapper: IntakeMapper,
  language?: Language,
): Promise<GenerateQuoteResult> {
  // 1. Validate the intake request
  const parseResult = IntakeRequestSchema.safeParse(rawRequest);
  if (!parseResult.success) {
    const details = parseResult.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('; ');
    throw new QuoteGenerationError(`Invalid intake request: ${details}`);
  }

  const request = parseResult.data as IntakeRequest;

  // Verify clientId matches the KB
  if (request.clientId !== kb.clientId) {
    throw new QuoteGenerationError(
      `Client ID mismatch: request has '${request.clientId}', KB has '${kb.clientId}'`,
    );
  }

  const lang: Language = language ?? request.language;

  // 2. Map free text to structured selections
  let mappedIntake;
  try {
    mappedIntake = await mapper.map(request, kb);
  } catch (err) {
    throw new QuoteGenerationError(
      `Intake mapping failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // 3. Compute the quote deterministically
  const quote = compute(kb, mappedIntake, lang);

  // 4. Format
  const text = renderText(quote);
  const json = renderJSON(quote);

  return { quote, text, json };
}
