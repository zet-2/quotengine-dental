/**
 * computePriceRange — an indicative € range driven by implant-count uncertainty.
 * Re-prices the quote at the low and high ends of the implant range (other line
 * items held constant). Deterministic; reuses the PricingEngine. Returns null when
 * the quote contains no implants (nothing to vary).
 */
import type { KnowledgeBase, MappedIntake, Language } from '../domain/types.js';
import { compute } from '../pricing/PricingEngine.js';
import { MAX_AUTO_QUOTE_IMPLANT_UNITS } from './autoQuotePolicy.js';
import { implantCountRange, type CountRange } from './implantRange.js';

export interface PriceRange {
  readonly implantRange: CountRange;
  readonly totalRange: { readonly low: number; readonly high: number };
}

function scaleImplants(
  mapped: MappedIntake,
  implantIds: ReadonlySet<string>,
  point: number,
  target: number,
): MappedIntake {
  const rawAllocations = mapped.lines.map((line, index) => ({
    index,
    raw: implantIds.has(line.itemId) ? (line.quantity * target) / point : -1,
  }));
  const quantities = rawAllocations.map(({ raw }) => raw < 0 ? -1 : Math.floor(raw));
  let remainder = target - quantities.reduce((sum, quantity) =>
    sum + Math.max(0, quantity), 0);
  const ranked = rawAllocations
    .filter(({ raw }) => raw >= 0)
    .sort((left, right) =>
      (right.raw - Math.floor(right.raw)) - (left.raw - Math.floor(left.raw)) ||
      left.index - right.index);
  for (let index = 0; remainder > 0 && ranked.length > 0; index += 1, remainder -= 1) {
    quantities[ranked[index % ranked.length]!.index]! += 1;
  }

  return {
    ...mapped,
    lines: mapped.lines
      .map((line, index) => implantIds.has(line.itemId)
        ? { ...line, quantity: quantities[index]! }
        : line)
      .filter((line) => line.quantity > 0),
  };
}

export function computePriceRange(
  kb: KnowledgeBase,
  mapped: MappedIntake,
  language: Language,
): PriceRange | null {
  const implantIds = new Set(
    kb.items.filter((i) => i.category === 'implants').map((i) => i.id),
  );
  const point = mapped.lines
    .filter((l) => implantIds.has(l.itemId))
    .reduce((acc, l) => acc + l.quantity, 0);

  if (point <= 0) return null;
  if (point > MAX_AUTO_QUOTE_IMPLANT_UNITS) {
    throw new Error('Implant quantity exceeds the supported automatic-quote scope');
  }

  const unconstrainedRange = implantCountRange(point);
  const implantRange = {
    low: unconstrainedRange.low,
    high: Math.min(unconstrainedRange.high, MAX_AUTO_QUOTE_IMPLANT_UNITS),
  };
  const low = compute(kb, scaleImplants(mapped, implantIds, point, implantRange.low), language).total;
  const high = compute(kb, scaleImplants(mapped, implantIds, point, implantRange.high), language).total;

  return { implantRange, totalRange: { low, high } };
}
