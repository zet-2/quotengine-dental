import type { KnowledgeBase, ServiceItem } from '../domain/types.js';
import type { DentalAssessment } from './types.js';

export const MAX_AUTO_QUOTE_CANDIDATES = 32;
export const MAX_AUTO_QUOTE_UNITS = 32;
/** Full-arch work is excluded until a complete clinic-approved package exists. */
export const MAX_AUTO_QUOTE_IMPLANT_UNITS = 3;

const AUTO_QUOTEABLE_CATEGORIES = new Set(['implants', 'crowns', 'veneers']);

export type AutoQuotePolicyReason =
  | 'allowed'
  | 'too_many_candidates'
  | 'confirmation_flag_missing'
  | 'unknown_item'
  | 'non_auto_quoteable_item'
  | 'mutually_exclusive_variants'
  | 'implant_scope_not_supported'
  | 'aggregate_quantity_exceeded';

export interface AutoQuotePolicyDecision {
  readonly allowed: boolean;
  readonly reason: AutoQuotePolicyReason;
}

export function isAutoQuoteableItem(item: ServiceItem): boolean {
  return AUTO_QUOTEABLE_CATEGORIES.has(item.category);
}

/** Deterministic boundary between model suggestions and an automatic patient-facing price. */
export function evaluateAutoQuotePolicy(
  assessment: DentalAssessment,
  kb: KnowledgeBase,
): AutoQuotePolicyDecision {
  if (assessment.candidateTreatments.length > MAX_AUTO_QUOTE_CANDIDATES) {
    return { allowed: false, reason: 'too_many_candidates' };
  }

  const itemById = new Map(kb.items.map((item) => [item.id, item]));
  const quantityByItem = new Map<string, number>();
  const itemByExclusiveGroup = new Map<string, string>();
  let totalQuantity = 0;
  let implantQuantity = 0;

  for (const treatment of assessment.candidateTreatments) {
    if (!treatment.needsConfirmation) {
      return { allowed: false, reason: 'confirmation_flag_missing' };
    }
    const item = itemById.get(treatment.itemId);
    if (!item) return { allowed: false, reason: 'unknown_item' };
    if (!isAutoQuoteableItem(item)) {
      return { allowed: false, reason: 'non_auto_quoteable_item' };
    }
    if (item.category === 'implants') {
      implantQuantity += treatment.quantity;
      if (implantQuantity > MAX_AUTO_QUOTE_IMPLANT_UNITS) {
        return { allowed: false, reason: 'implant_scope_not_supported' };
      }
    }
    if (item.exclusiveGroup) {
      const selectedVariant = itemByExclusiveGroup.get(item.exclusiveGroup);
      if (selectedVariant && selectedVariant !== item.id) {
        return { allowed: false, reason: 'mutually_exclusive_variants' };
      }
      itemByExclusiveGroup.set(item.exclusiveGroup, item.id);
    }

    const aggregate = (quantityByItem.get(treatment.itemId) ?? 0) + treatment.quantity;
    quantityByItem.set(treatment.itemId, aggregate);
    totalQuantity += treatment.quantity;
    if (aggregate > MAX_AUTO_QUOTE_UNITS || totalQuantity > MAX_AUTO_QUOTE_UNITS) {
      return { allowed: false, reason: 'aggregate_quantity_exceeded' };
    }
  }

  return { allowed: true, reason: 'allowed' };
}
