/**
 * Validates a DentalAssessment against the KB: every candidate treatment must map
 * to an item that exists in the client's price list. Hard error on unknown IDs —
 * the model must NOT invent treatments.
 */
import type { KnowledgeBase } from '../domain/types.js';
import type { DentalAssessment } from './types.js';

export type AssessmentValidationResult =
  | { ok: true; assessment: DentalAssessment }
  | { ok: false; error: string };

export function validateAssessmentAgainstKB(
  assessment: DentalAssessment,
  kb: KnowledgeBase,
): AssessmentValidationResult {
  const itemIds = new Set(kb.items.map((i) => i.id));
  const unknown = assessment.candidateTreatments
    .map((t) => t.itemId)
    .filter((id) => !itemIds.has(id));

  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Unknown treatment item IDs not present in KB: ${unknown.join(', ')}`,
    };
  }

  return { ok: true, assessment };
}
