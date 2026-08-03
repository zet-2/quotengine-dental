/**
 * Core domain types for quotengine.
 * All types are immutable (readonly). No side effects anywhere in this file.
 */

export type Language = 'it' | 'sq' | 'en';

export type Currency = string; // ISO 4217, e.g. 'EUR', 'USD', 'ALL'

export type Unit = 'unit' | 'hour' | 'm2' | 'm3' | 'kg' | 'session' | 'day' | 'tooth';

/** Per-language string map */
export type LocalizedString = Readonly<Record<Language, string>>;

/** A single service/product offered by the client */
export interface ServiceItem {
  readonly id: string;
  readonly name: LocalizedString;
  readonly unit: Unit;
  readonly unitPrice: number;
  /** Optional labor hours per unit (for items that include labor) */
  readonly laborHoursPerUnit?: number;
  readonly category: string;
  /** Items in the same group are alternative commercial variants, never additive. */
  readonly exclusiveGroup?: string;
}

/** Types of pricing rules */
export type PricingRuleKind =
  | 'laborHourlyRate'
  | 'callOutFee'
  | 'minimumCharge'
  | 'distanceFee';

/** A named pricing rule with a numeric value */
export interface PricingRule {
  readonly kind: PricingRuleKind;
  readonly value: number;
  /** Optional label per language */
  readonly label?: LocalizedString;
}

/** Modifier condition: applies only when a condition is met */
export interface ModifierCondition {
  readonly field: 'category' | 'quantity' | 'subtotal';
  readonly operator: 'eq' | 'gt' | 'lt' | 'gte' | 'lte';
  readonly value: string | number;
}

export type ModifierType = 'percentage' | 'flat';

/** A price modifier — can be a surcharge or discount */
export interface Modifier {
  readonly id: string;
  readonly label: LocalizedString;
  readonly type: ModifierType;
  /** Positive = surcharge, negative = discount */
  readonly value: number;
  /** If present, modifier only applies when ALL conditions are met */
  readonly conditions?: readonly ModifierCondition[];
}

/** The full knowledge base for one client */
export interface KnowledgeBase {
  readonly clientId: string;
  readonly clientName: string;
  readonly languages: readonly Language[];
  readonly defaultLanguage: Language;
  readonly currency: Currency;
  readonly items: readonly ServiceItem[];
  readonly rules: readonly PricingRule[];
  readonly modifiers: readonly Modifier[];
  /** Applied to subtotal+labor+fees total before tax */
  readonly markupPercent: number;
  /** Applied after markup */
  readonly taxPercent: number;
  readonly notes?: LocalizedString;
}

/** Kind of image a customer can submit with an intake request */
export type IntakeImageKind = 'photo' | 'panoramic_xray' | 'document';

/** Supported image media types (base64-encoded payloads) */
export type IntakeImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

/** An image attached to an intake request (e.g. intraoral photo or panoramic x-ray) */
export interface IntakeImage {
  readonly kind: IntakeImageKind;
  readonly mediaType: IntakeImageMediaType;
  /** Base64-encoded image data (no `data:` URI prefix) */
  readonly data: string;
}

/** Input from employee on behalf of customer */
export interface IntakeRequest {
  readonly clientId: string;
  readonly language: Language;
  readonly freeText: string;
  /** Optional override for specific modifiers to include */
  readonly requestedModifierIds?: readonly string[];
  /** Optional images (e.g. intraoral photos, panoramic x-ray) for multimodal intake */
  readonly images?: readonly IntakeImage[];
}

/** A single resolved line in the quote */
export interface LineItem {
  readonly itemId: string;
  readonly label: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly laborHoursPerUnit: number;
  /** quantity × unitPrice */
  readonly lineTotal: number;
}

/** A modifier that was actually applied */
export interface AppliedModifier {
  readonly id: string;
  readonly label: string;
  readonly type: ModifierType;
  readonly value: number;
  /** The computed amount (positive = added, negative = subtracted) */
  readonly amount: number;
}

/** The fully-computed, immutable quote */
export interface Quote {
  readonly clientId: string;
  readonly language: Language;
  readonly currency: Currency;
  readonly lineItems: readonly LineItem[];
  /** Sum of lineItem totals */
  readonly subtotal: number;
  /** Total labor cost (hours × rate) */
  readonly labor: number;
  /** Fixed fees (callout, minimum charge, etc.) */
  readonly fees: number;
  /** Modifiers applied with their computed amounts */
  readonly modifiersApplied: readonly AppliedModifier[];
  /** Total modifier adjustments (sum of amounts) */
  readonly modifiersTotal: number;
  /** Markup amount (on subtotal+labor+fees+modifiers) */
  readonly markup: number;
  /** Tax amount (on post-markup total) */
  readonly tax: number;
  /** Final total */
  readonly total: number;
  /** ISO 8601 */
  readonly generatedAt: string;
  readonly notes?: string;
}

/** What the intake mapper produces per line */
export interface MappedLineSelection {
  readonly itemId: string;
  readonly quantity: number;
  /** IDs of modifiers to apply to this line (optional) */
  readonly modifierIds?: readonly string[];
}

/** Full output from intake mapper */
export interface MappedIntake {
  readonly lines: readonly MappedLineSelection[];
  /** IDs of modifiers to apply at quote level */
  readonly quoteModifierIds: readonly string[];
  /** Optional free-text notes from the mapper */
  readonly notes?: string;
}
