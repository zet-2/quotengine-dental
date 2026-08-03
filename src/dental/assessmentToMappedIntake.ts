/**
 * Pure converter: DentalAssessment → MappedIntake (the shape the deterministic
 * PricingEngine consumes).
 *
 * - Merges duplicate item IDs (e.g. implants on both arches) by summing quantity.
 * - Applies NO quote modifiers — discounts/surcharges are a separate business
 *   decision and are never auto-applied from a vision assessment.
 *
 * No side effects; inputs are never mutated.
 */
import type { DentalAssessment } from './types.js';
import type { MappedIntake, MappedLineSelection } from '../domain/types.js';

export function assessmentToMappedIntake(
  assessment: DentalAssessment,
): MappedIntake {
  const quantityByItem = new Map<string, number>();
  const order: string[] = [];

  for (const treatment of assessment.candidateTreatments) {
    if (!quantityByItem.has(treatment.itemId)) {
      order.push(treatment.itemId);
    }
    quantityByItem.set(
      treatment.itemId,
      (quantityByItem.get(treatment.itemId) ?? 0) + treatment.quantity,
    );
  }

  const lines: MappedLineSelection[] = order.map((itemId) => ({
    itemId,
    quantity: quantityByItem.get(itemId) ?? 0,
  }));

  return {
    lines,
    quoteModifierIds: [],
    notes: assessment.notes,
  };
}
