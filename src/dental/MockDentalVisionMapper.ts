/**
 * MockDentalVisionMapper — offline dental vision mapper for tests and CLI demo
 * without an API key. Mirrors the MockIntakeMapper pattern: optional freeText →
 * fixed-assessment overrides, otherwise a deterministic KB-grounded default.
 */
import type { IntakeRequest, KnowledgeBase } from '../domain/types.js';
import type { DentalAssessment, CandidateTreatment } from './types.js';
import type { DentalVisionMapper } from './DentalVisionMapper.js';
import { DentalAssessmentSchema } from './schemas.js';
import { validateAssessmentAgainstKB } from './validation.js';

export class MockDentalVisionMapper implements DentalVisionMapper {
  private readonly overrides: Map<string, DentalAssessment>;

  constructor(overrides?: Record<string, DentalAssessment>) {
    this.overrides = new Map(Object.entries(overrides ?? {}));
  }

  async assess(request: IntakeRequest, kb: KnowledgeBase): Promise<DentalAssessment> {
    const exact = this.overrides.get(request.freeText);
    if (exact) return this.validate(exact, kb);

    for (const [key, value] of this.overrides) {
      if (request.freeText.toLowerCase().includes(key.toLowerCase())) {
        return this.validate(value, kb);
      }
    }

    return this.validate(this.defaultAssessment(kb, request.freeText), kb);
  }

  /** A deterministic, KB-grounded default assessment for offline demos/tests */
  private defaultAssessment(kb: KnowledgeBase, freeText: string): DentalAssessment {
    const firstImplant = kb.items.find((i) => i.category === 'implants');
    const firstCrown = kb.items.find((i) => i.category === 'crowns');

    const candidateTreatments: CandidateTreatment[] = [];
    if (firstImplant) {
      candidateTreatments.push({
        itemId: firstImplant.id,
        quantity: 2,
        arch: 'upper',
        rationale: '[Mock] visible gap suggesting implant candidates',
        needsConfirmation: true,
      });
    }
    if (firstCrown) {
      candidateTreatments.push({
        itemId: firstCrown.id,
        quantity: 2,
        arch: 'upper',
        rationale: '[Mock] restorations to accompany implants',
        needsConfirmation: true,
      });
    }

    return {
      archFindings: [
        { arch: 'upper', observation: '[Mock] partial edentulism', confidence: 'medium' },
      ],
      candidateTreatments,
      imageQuality: 'fair',
      overallConfidence: 'medium',
      requiresClinicalConfirmation: true,
      notes: `[Mock] assessment from: "${freeText}"`,
    };
  }

  private validate(assessment: DentalAssessment, kb: KnowledgeBase): DentalAssessment {
    const parsed = DentalAssessmentSchema.safeParse(assessment);
    if (!parsed.success) {
      throw new Error(
        `MockDentalVisionMapper produced invalid output: ${parsed.error.message}`,
      );
    }

    const result = validateAssessmentAgainstKB(parsed.data as DentalAssessment, kb);
    if (!result.ok) {
      throw new Error(`MockDentalVisionMapper KB validation failed: ${result.error}`);
    }

    return result.assessment;
  }
}
