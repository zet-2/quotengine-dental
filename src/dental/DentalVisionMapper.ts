/**
 * DentalVisionMapper interface.
 * Produces a structured, NON-DIAGNOSTIC DentalAssessment from an intake request
 * (free text + optional images).
 *
 * Implementations:
 *  - MockDentalVisionMapper (offline / tests / CLI, no API key)
 *  - ClaudeDentalVisionMapper (real, Claude multimodal)
 */
import type { IntakeRequest, KnowledgeBase } from '../domain/types.js';
import type { DentalAssessment } from './types.js';

export interface DentalVisionMapper {
  /**
   * Assess an intake request against the client's KB.
   * Implementations MUST validate output against the KB (no invented treatments).
   */
  assess(request: IntakeRequest, kb: KnowledgeBase): Promise<DentalAssessment>;
}
