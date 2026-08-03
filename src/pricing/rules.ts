/**
 * Pure rule/modifier application helpers.
 * No side effects. No mutation. No I/O.
 */
import type {
  KnowledgeBase,
  LineItem,
  Modifier,
  AppliedModifier,
  ModifierCondition,
  MappedLineSelection,
} from '../domain/types.js';
import { getItemById } from '../kb/KnowledgeBase.js';

/** Round a number to 2 decimal places (banker's rounding via standard JS) */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Build a LineItem from a MappedLineSelection and KB.
 * Returns null if the itemId is not found in the KB (safety guard).
 */
export function buildLineItem(
  selection: MappedLineSelection,
  kb: KnowledgeBase,
  language: string,
): LineItem | null {
  const item = getItemById(kb, selection.itemId);
  if (!item) return null;

  const labelKey = language as keyof typeof item.name;
  const label = item.name[labelKey] ?? item.name.en;
  const laborHoursPerUnit = item.laborHoursPerUnit ?? 0;
  const lineTotal = round2(selection.quantity * item.unitPrice);

  return {
    itemId: item.id,
    label,
    quantity: selection.quantity,
    unitPrice: item.unitPrice,
    laborHoursPerUnit,
    lineTotal,
  };
}

/**
 * Compute total labor hours from line items.
 */
export function computeLaborHours(lineItems: readonly LineItem[]): number {
  return lineItems.reduce(
    (acc, li) => acc + li.laborHoursPerUnit * li.quantity,
    0,
  );
}

/**
 * Evaluate a single modifier condition against quote context.
 */
export function evaluateCondition(
  condition: ModifierCondition,
  context: {
    readonly category?: string;
    readonly quantity?: number;
    readonly subtotal?: number;
  },
): boolean {
  const { field, operator, value } = condition;

  let actual: string | number | undefined;
  if (field === 'category') actual = context.category;
  else if (field === 'quantity') actual = context.quantity;
  else if (field === 'subtotal') actual = context.subtotal;

  if (actual === undefined) return false;

  switch (operator) {
    case 'eq': return actual === value;
    case 'gt': return actual > value;
    case 'lt': return actual < value;
    case 'gte': return actual >= value;
    case 'lte': return actual <= value;
    default: return false;
  }
}

/**
 * Determine if a modifier should be applied given a quote-level context.
 * A modifier with no conditions always applies.
 * A modifier with conditions applies only when ALL conditions pass.
 */
export function shouldApplyModifier(
  modifier: Modifier,
  context: {
    readonly category?: string;
    readonly quantity?: number;
    readonly subtotal?: number;
  },
): boolean {
  if (!modifier.conditions || modifier.conditions.length === 0) return true;
  return modifier.conditions.every((c) => evaluateCondition(c, context));
}

/**
 * Compute the amount a modifier adds/subtracts given a base value.
 * Percentage: amount = base * (value / 100)
 * Flat: amount = value
 */
export function computeModifierAmount(
  modifier: Modifier,
  base: number,
): number {
  if (modifier.type === 'percentage') {
    return round2(base * (modifier.value / 100));
  }
  return round2(modifier.value);
}

/**
 * Apply a list of modifiers to a base total, returning AppliedModifier records.
 */
export function applyModifiers(
  modifiers: readonly Modifier[],
  base: number,
  language: string,
  context: {
    readonly category?: string;
    readonly quantity?: number;
    readonly subtotal?: number;
  },
): readonly AppliedModifier[] {
  const labelKey = language as 'it' | 'sq' | 'en';

  return modifiers
    .filter((m) => shouldApplyModifier(m, context))
    .map((m) => ({
      id: m.id,
      label: m.label[labelKey] ?? m.label.en,
      type: m.type,
      value: m.value,
      amount: computeModifierAmount(m, base),
    }));
}
