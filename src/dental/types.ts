/**
 * Dental vision-intake domain types.
 *
 * A DentalAssessment is the structured, NON-DIAGNOSTIC extraction produced from
 * patient images + free text. It maps coarse treatment *signals* to KB item IDs;
 * the deterministic PricingEngine prices them. The result is always indicative and
 * always subject to in-person clinical confirmation — never a diagnosis or a
 * final treatment plan.
 *
 * All types are immutable (readonly).
 */

export type Arch = 'upper' | 'lower';
export type Confidence = 'low' | 'medium' | 'high';
export type ImageQuality = 'good' | 'fair' | 'poor';

/** A coarse observation about one dental arch (not a diagnosis) */
export interface ArchFinding {
  readonly arch: Arch;
  readonly observation: string;
  readonly confidence: Confidence;
}

/** A candidate treatment line — `itemId` MUST exist in the dental KB */
export interface CandidateTreatment {
  readonly itemId: string;
  readonly quantity: number;
  /** Required so a patient-selected single-arch scope can be enforced deterministically. */
  readonly arch: Arch;
  readonly rationale: string;
  /** Always true at MVP: every item needs dentist confirmation */
  readonly needsConfirmation: boolean;
}

/** Type of an existing restoration already present in the mouth */
export type RestorationType = 'implant' | 'crown' | 'bridge' | 'post' | 'denture' | 'other';

/** A restoration the patient ALREADY has — reported for transparency, never billed */
export interface ExistingRestoration {
  readonly type: RestorationType;
  readonly arch?: Arch;
  readonly count: number;
  readonly note?: string;
}

/** Structured, non-diagnostic assessment extracted from images + text */
export interface DentalAssessment {
  readonly archFindings: readonly ArchFinding[];
  readonly candidateTreatments: readonly CandidateTreatment[];
  /** Restorations already present (implants/crowns/…). Informational — never priced. */
  readonly existingRestorations?: readonly ExistingRestoration[];
  readonly imageQuality: ImageQuality;
  readonly overallConfidence: Confidence;
  /** True ⇒ the estimate is indicative and must be confirmed in person */
  readonly requiresClinicalConfirmation: boolean;
  readonly notes?: string;
}
