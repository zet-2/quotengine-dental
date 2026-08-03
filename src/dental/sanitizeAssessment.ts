/**
 * sanitizeAssessment — the safety gate applied to a DentalAssessment before pricing.
 *
 * Policy (non-negotiable for the dental flow):
 *  1. Always require in-person clinical confirmation (the estimate is never final).
 *  2. Never quote on uncertain input: if image quality is poor or overall confidence
 *     is low, drop all candidate treatments so the pipeline routes to "book a consult"
 *     instead of producing a guessed price.
 *  3. Enforce the deterministic auto-quote boundary: clinical categories only,
 *     confirmed-as-non-final lines, and bounded candidate/aggregate quantities.
 *
 * Pure; the input is never mutated.
 */
import type { KnowledgeBase } from '../domain/types.js';
import { evaluateAutoQuotePolicy } from './autoQuotePolicy.js';
import type { PatientTargetArea } from './patientIntent.js';
import type { DentalAssessment } from './types.js';

export function sanitizeAssessment(
  assessment: DentalAssessment,
  kb: KnowledgeBase,
  targetArea: PatientTargetArea = 'both',
): DentalAssessment {
  const scopedAssessment: DentalAssessment = targetArea === 'both'
    ? assessment
    : {
        ...assessment,
        // Unscoped candidates are excluded for a single-arch request: including
        // them could silently quote work from the opposite arch.
        candidateTreatments: assessment.candidateTreatments.filter(
          (treatment) => treatment.arch === targetArea,
        ),
      };
  const tooUncertainToQuote =
    scopedAssessment.imageQuality === 'poor' || scopedAssessment.overallConfidence === 'low';
  const violatesAutoQuotePolicy = !evaluateAutoQuotePolicy(scopedAssessment, kb).allowed;

  return {
    ...scopedAssessment,
    candidateTreatments: tooUncertainToQuote || violatesAutoQuotePolicy
      ? []
      : scopedAssessment.candidateTreatments,
    requiresClinicalConfirmation: true,
  };
}
