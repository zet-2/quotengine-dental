/**
 * Validates a MappedIntake against the KB:
 * - All itemIds must exist in kb.items
 * - All modifierIds must exist in kb.modifiers
 * - Drops any unrecognized modifier IDs with a warning rather than throwing
 *   (graceful model output handling)
 */
import type { KnowledgeBase, MappedIntake } from '../domain/types.js';

export type ValidationResult =
  | { ok: true; intake: MappedIntake }
  | { ok: false; error: string };

export function validateMappedIntakeAgainstKB(
  intake: MappedIntake,
  kb: KnowledgeBase,
): ValidationResult {
  const itemIds = new Set(kb.items.map((i) => i.id));
  const modifierIds = new Set(kb.modifiers.map((m) => m.id));

  // Validate line item IDs — hard error (the model must not invent items)
  const unknownItems = intake.lines
    .map((l) => l.itemId)
    .filter((id) => !itemIds.has(id));

  if (unknownItems.length > 0) {
    return {
      ok: false,
      error: `Unknown item IDs not present in KB: ${unknownItems.join(', ')}`,
    };
  }

  // Validate modifier IDs — soft: drop unknown ones, keep valid
  const sanitizedLines = intake.lines.map((line) => {
    const validModIds = (line.modifierIds ?? []).filter((id) => {
      const valid = modifierIds.has(id);
      if (!valid) {
        console.warn(
          `[quotengine] Dropping unknown modifier ID '${id}' on line item '${line.itemId}'`,
        );
      }
      return valid;
    });
    if (validModIds.length > 0) {
      return { ...line, modifierIds: validModIds };
    }
    const { modifierIds: _ignored, ...lineWithoutModifiers } = line;
    return lineWithoutModifiers;
  });

  const validQuoteModIds = intake.quoteModifierIds.filter((id) => {
    const valid = modifierIds.has(id);
    if (!valid) {
      console.warn(`[quotengine] Dropping unknown quote modifier ID '${id}'`);
    }
    return valid;
  });

  return {
    ok: true,
    intake: {
      ...intake,
      lines: sanitizedLines,
      quoteModifierIds: validQuoteModIds,
    },
  };
}
