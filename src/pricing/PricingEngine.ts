/**
 * PricingEngine — PURE deterministic pricing.
 * The LLM never does arithmetic. All math is here.
 *
 * Flow:
 *   lineItems → subtotal
 *   + labor (hours × laborHourlyRate)
 *   + fees (callOutFee, then minimumCharge enforcement)
 *   + line-level modifier adjustments (on their own line totals)
 *   + quote-level modifier adjustments (on subtotal+labor+fees+line modifiers)
 *   + markup (percent of pre-markup)
 *   + tax (percent of post-markup)
 *   = total
 *
 * All values are immutable. Functions are pure.
 */
import type {
  KnowledgeBase,
  LineItem,
  Quote,
  MappedIntake,
  MappedLineSelection,
  Language,
  Modifier,
  AppliedModifier,
} from '../domain/types.js';
import { getItemById, getModifierById, getRuleByKind } from '../kb/KnowledgeBase.js';
import {
  buildLineItem,
  computeLaborHours,
  applyModifiers,
  round2,
} from './rules.js';

function collectQuoteModifiers(
  kb: KnowledgeBase,
  mappedIntake: MappedIntake,
  lineModifierIds: ReadonlySet<string>,
): readonly Modifier[] {
  const ids = new Set(
    mappedIntake.quoteModifierIds.filter((id) => !lineModifierIds.has(id)),
  );

  return Array.from(ids)
    .map((id) => getModifierById(kb, id))
    .filter((m): m is Modifier => m !== undefined);
}

function collectLineModifierIds(lines: readonly MappedLineSelection[]): ReadonlySet<string> {
  return new Set(lines.flatMap((line) => line.modifierIds ?? []));
}

function applyLineLevelModifiers(
  kb: KnowledgeBase,
  mappedIntake: MappedIntake,
  language: Language,
): readonly AppliedModifier[] {
  return mappedIntake.lines.flatMap((selection) => {
    const item = getItemById(kb, selection.itemId);
    if (!item || !selection.modifierIds || selection.modifierIds.length === 0) {
      return [];
    }

    const lineItem = buildLineItem(selection, kb, language);
    if (!lineItem) return [];

    const modifiers = Array.from(new Set(selection.modifierIds))
      .map((id) => getModifierById(kb, id))
      .filter((m): m is Modifier => m !== undefined);

    return applyModifiers(modifiers, lineItem.lineTotal, language, {
      category: item.category,
      quantity: selection.quantity,
      subtotal: lineItem.lineTotal,
    });
  });
}

/** Compute total fees from rules (callout + other fixed fees) */
function computeFees(kb: KnowledgeBase): number {
  const callOut = getRuleByKind(kb, 'callOutFee');
  const distance = getRuleByKind(kb, 'distanceFee');
  const callOutValue = callOut?.value ?? 0;
  const distanceValue = distance?.value ?? 0;
  return round2(callOutValue + distanceValue);
}

/** Apply minimumCharge rule: if pre-tax total < minimum, bump fees to compensate */
function applyMinimumCharge(
  kb: KnowledgeBase,
  currentTotal: number,
  currentFees: number,
): number {
  const rule = getRuleByKind(kb, 'minimumCharge');
  if (!rule) return currentFees;
  if (currentTotal >= rule.value) return currentFees;
  const shortfall = round2(rule.value - currentTotal);
  return round2(currentFees + shortfall);
}

/**
 * Core computation. Pure function — given a KB and mapped intake, returns a Quote.
 */
export function compute(
  kb: KnowledgeBase,
  mappedIntake: MappedIntake,
  language: Language,
  generatedAt: string = new Date().toISOString(),
): Quote {
  // 1. Resolve line items
  const lineItems: LineItem[] = mappedIntake.lines
    .map((sel) => buildLineItem(sel, kb, language))
    .filter((li): li is LineItem => li !== null);

  // 2. Subtotal
  const subtotal = round2(lineItems.reduce((acc, li) => acc + li.lineTotal, 0));

  // 3. Labor
  const laborHours = computeLaborHours(lineItems);
  const laborRateRule = getRuleByKind(kb, 'laborHourlyRate');
  const laborRate = laborRateRule?.value ?? 0;
  const labor = round2(laborHours * laborRate);

  // 4. Fixed fees (before minimum charge)
  const rawFees = computeFees(kb);

  // 5. Pre-modifier base
  const preModifierBase = round2(subtotal + labor + rawFees);

  // 6. Apply line-level modifiers to their own line totals, then quote-level modifiers.
  const lineModifiersApplied = applyLineLevelModifiers(kb, mappedIntake, language);
  const lineModifiersTotal = round2(
    lineModifiersApplied.reduce((acc, m) => acc + m.amount, 0),
  );
  const quoteModifierBase = round2(preModifierBase + lineModifiersTotal);
  const quoteModifiersToApply = collectQuoteModifiers(
    kb,
    mappedIntake,
    collectLineModifierIds(mappedIntake.lines),
  );
  const quoteModifiersApplied = applyModifiers(quoteModifiersToApply, quoteModifierBase, language, {
    subtotal: quoteModifierBase,
  });
  const modifiersApplied = [...lineModifiersApplied, ...quoteModifiersApplied];
  const modifiersTotal = round2(
    modifiersApplied.reduce((acc, m) => acc + m.amount, 0),
  );

  // 7. Pre-markup total (before minimum charge enforcement)
  const preMarkupBase = round2(preModifierBase + modifiersTotal);

  // 8. Apply minimum charge (adjusts fees if needed)
  const fees = applyMinimumCharge(kb, preMarkupBase, rawFees);
  const feesAdjustment = round2(fees - rawFees);

  // Recompute with adjusted fees
  const adjustedBase = round2(preMarkupBase + feesAdjustment);

  // 9. Markup
  const markup = round2(adjustedBase * (kb.markupPercent / 100));

  // 10. Tax
  const postMarkup = round2(adjustedBase + markup);
  const tax = round2(postMarkup * (kb.taxPercent / 100));

  // 11. Total
  const total = round2(postMarkup + tax);

  // 12. Notes
  const notesKey = language as keyof NonNullable<typeof kb.notes>;
  const notes = kb.notes?.[notesKey] ?? mappedIntake.notes;

  return {
    clientId: kb.clientId,
    language,
    currency: kb.currency,
    lineItems,
    subtotal,
    labor,
    fees,
    modifiersApplied,
    modifiersTotal,
    markup,
    tax,
    total,
    generatedAt,
    notes,
  };
}
