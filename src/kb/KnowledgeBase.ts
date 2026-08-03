/**
 * KnowledgeBase loader: validates a raw config object against the KnowledgeBase schema.
 * Returns a strongly-typed, immutable KnowledgeBase or throws with clear error messages.
 */
import { KnowledgeBaseSchema } from '../domain/schemas.js';
import type { KnowledgeBase } from '../domain/types.js';

export class KnowledgeBaseValidationError extends Error {
  constructor(
    message: string,
    public readonly details: string,
  ) {
    super(message);
    this.name = 'KnowledgeBaseValidationError';
  }
}

/**
 * Validate and return a frozen KnowledgeBase.
 * Throws KnowledgeBaseValidationError if the config is invalid.
 */
export function loadKnowledgeBase(raw: unknown): KnowledgeBase {
  const result = KnowledgeBaseSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new KnowledgeBaseValidationError(
      `Invalid KnowledgeBase configuration`,
      details,
    );
  }

  const kb = result.data as KnowledgeBase;

  // Extra cross-field validation: defaultLanguage must be in languages array
  if (!kb.languages.includes(kb.defaultLanguage)) {
    throw new KnowledgeBaseValidationError(
      `Invalid KnowledgeBase configuration`,
      `  defaultLanguage '${kb.defaultLanguage}' is not in languages [${kb.languages.join(', ')}]`,
    );
  }

  // Item IDs must be unique
  const itemIds = kb.items.map((i) => i.id);
  const duplicates = itemIds.filter((id, idx) => itemIds.indexOf(id) !== idx);
  if (duplicates.length > 0) {
    throw new KnowledgeBaseValidationError(
      `Invalid KnowledgeBase configuration`,
      `  Duplicate item IDs: ${duplicates.join(', ')}`,
    );
  }

  // Modifier IDs must be unique
  const modifierIds = kb.modifiers.map((m) => m.id);
  const dupMods = modifierIds.filter((id, idx) => modifierIds.indexOf(id) !== idx);
  if (dupMods.length > 0) {
    throw new KnowledgeBaseValidationError(
      `Invalid KnowledgeBase configuration`,
      `  Duplicate modifier IDs: ${dupMods.join(', ')}`,
    );
  }

  return kb;
}

/** Look up an item by ID from a validated KB */
export function getItemById(kb: KnowledgeBase, itemId: string) {
  return kb.items.find((item) => item.id === itemId);
}

/** Look up a modifier by ID from a validated KB */
export function getModifierById(kb: KnowledgeBase, modifierId: string) {
  return kb.modifiers.find((m) => m.id === modifierId);
}

/** Look up a pricing rule by kind */
export function getRuleByKind(kb: KnowledgeBase, kind: string) {
  return kb.rules.find((r) => r.kind === kind);
}
