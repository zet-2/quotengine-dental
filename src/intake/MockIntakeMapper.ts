/**
 * MockIntakeMapper — offline mapper for tests and CLI demo without API key.
 * Returns a deterministic selection based on the KB's first items,
 * or a custom selection registered for a specific text pattern.
 */
import type {
  IntakeRequest,
  KnowledgeBase,
  MappedIntake,
  MappedLineSelection,
} from '../domain/types.js';
import type { IntakeMapper } from './IntakeMapper.js';
import { MappedIntakeSchema } from '../domain/schemas.js';
import { validateMappedIntakeAgainstKB } from './validation.js';

interface MockRule {
  readonly itemId: string;
  readonly keywords: readonly string[];
  readonly exclusiveCategory?: string;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  uno: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
};

const RULES: Readonly<Record<string, readonly MockRule[]>> = {
  'dental-clinic': [
    { itemId: 'crown-zirconia', keywords: ['zirconia', 'zirkon', 'zirconio'], exclusiveCategory: 'crowns' },
    { itemId: 'crown-porcelain', keywords: ['porcelain crown', 'ceramic crown', 'crown', 'corona'], exclusiveCategory: 'crowns' },
    { itemId: 'implant-standard', keywords: ['standard implant', 'implant', 'impianto', 'implante'], exclusiveCategory: 'implants' },
    { itemId: 'veneer-porcelain', keywords: ['porcelain veneer', 'ceramic veneer'], exclusiveCategory: 'veneers' },
    { itemId: 'veneer-composite', keywords: ['veneer', 'faccetta', 'faseta'], exclusiveCategory: 'veneers' },
    { itemId: 'extraction', keywords: ['extraction', 'extract', 'estrazione'] },
    { itemId: 'cleaning', keywords: ['cleaning', 'igiene', 'pastrim'] },
    { itemId: 'xray-panoramic', keywords: ['x-ray', 'xray', 'panoramic', 'radiografia'] },
  ],
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quantityFromWord(value: string): number | null {
  return NUMBER_WORDS[value.toLowerCase()] ?? null;
}

function quantityNearKeyword(text: string, keyword: string): number | null {
  const numberPattern = '(\\d+(?:[.,]\\d+)?|[a-z]+)';
  const keywordPattern = escapeRegex(keyword);
  const suffix = /[a-z]$/i.test(keyword) ? 's?\\b' : '\\b';
  const before = new RegExp(`\\b${numberPattern}\\s+(?:\\w+\\s+){0,3}${keywordPattern}${suffix}`, 'i');
  const beforeMatch = text.match(before);
  const raw = beforeMatch?.[1];
  if (!raw) return null;
  const numeric = Number(raw.replace(',', '.'));
  return Number.isFinite(numeric) ? numeric : quantityFromWord(raw);
}

function quantityForRule(text: string, rule: MockRule): number {
  for (const keyword of rule.keywords) {
    const nearby = quantityNearKeyword(text, keyword);
    if (nearby !== null) return nearby;
  }

  return 1;
}

function buildHeuristicIntake(request: IntakeRequest, kb: KnowledgeBase): MappedIntake | null {
  const rules = RULES[kb.clientId] ?? [];
  const availableItemIds = new Set(kb.items.map((item) => item.id));
  const usedExclusiveCategories = new Set<string>();
  const lines: MappedLineSelection[] = [];
  const text = request.freeText.toLowerCase();

  for (const rule of rules) {
    if (!availableItemIds.has(rule.itemId)) continue;
    if (rule.exclusiveCategory && usedExclusiveCategories.has(rule.exclusiveCategory)) {
      continue;
    }
    if (!rule.keywords.some((keyword) => text.includes(keyword))) continue;

    lines.push({ itemId: rule.itemId, quantity: quantityForRule(text, rule) });
    if (rule.exclusiveCategory) usedExclusiveCategories.add(rule.exclusiveCategory);
  }

  if (lines.length === 0) return null;
  return {
    lines,
    quoteModifierIds: [],
    notes: `[Mock] Heuristically mapped from: "${request.freeText}"`,
  };
}

export class MockIntakeMapper implements IntakeMapper {
  /** Optional override: map freeText patterns to fixed selections */
  private readonly overrides: Map<string, MappedIntake>;

  constructor(overrides?: Record<string, MappedIntake>) {
    this.overrides = new Map(Object.entries(overrides ?? {}));
  }

  async map(request: IntakeRequest, kb: KnowledgeBase): Promise<MappedIntake> {
    // Check for an exact override
    const override = this.overrides.get(request.freeText);
    if (override) {
      return this.validate(override, kb);
    }

    // Fuzzy match: look for override keys that appear in the freeText
    for (const [key, value] of this.overrides) {
      if (request.freeText.toLowerCase().includes(key.toLowerCase())) {
        return this.validate(value, kb);
      }
    }

    const heuristic = buildHeuristicIntake(request, kb);
    if (heuristic) {
      return this.validate(heuristic, kb);
    }

    // Fallback: pick up to 2 catalog items so the offline demo remains runnable.
    const defaultLines = kb.items.slice(0, 2).map((item) => ({
      itemId: item.id,
      quantity: 1,
    }));

    const defaultIntake: MappedIntake = {
      lines: defaultLines,
      quoteModifierIds: [],
      notes: `[Mock] Mapped from: "${request.freeText}"`,
    };

    return this.validate(defaultIntake, kb);
  }

  private validate(intake: MappedIntake, kb: KnowledgeBase): MappedIntake {
    // Zod-validate schema first
    const parsed = MappedIntakeSchema.safeParse(intake);
    if (!parsed.success) {
      throw new Error(
        `MockIntakeMapper produced invalid output: ${parsed.error.message}`,
      );
    }

    // Then validate item/modifier IDs exist in the KB
    const result = validateMappedIntakeAgainstKB(parsed.data as MappedIntake, kb);
    if (!result.ok) {
      throw new Error(`MockIntakeMapper KB validation failed: ${result.error}`);
    }

    return result.intake;
  }
}
