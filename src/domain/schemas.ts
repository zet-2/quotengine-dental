/**
 * Zod schemas for all domain types.
 * Used for runtime validation of config, intake, and model output.
 */
import { z } from 'zod';

export const LanguageSchema = z.enum(['it', 'sq', 'en']);

export const CurrencySchema = z.string().min(3).max(3).toUpperCase();

export const UnitSchema = z.enum(['unit', 'hour', 'm2', 'm3', 'kg', 'session', 'day', 'tooth']);

export const LocalizedStringSchema = z.object({
  it: z.string().min(1),
  sq: z.string().min(1),
  en: z.string().min(1),
});

export const ServiceItemSchema = z.object({
  id: z.string().min(1),
  name: LocalizedStringSchema,
  unit: UnitSchema,
  unitPrice: z.number().nonnegative(),
  laborHoursPerUnit: z.number().nonnegative().optional(),
  category: z.string().min(1),
  exclusiveGroup: z.string().min(1).optional(),
});

export const PricingRuleKindSchema = z.enum([
  'laborHourlyRate',
  'callOutFee',
  'minimumCharge',
  'distanceFee',
]);

export const PricingRuleSchema = z.object({
  kind: PricingRuleKindSchema,
  value: z.number().nonnegative(),
  label: LocalizedStringSchema.optional(),
});

export const ModifierConditionSchema = z.object({
  field: z.enum(['category', 'quantity', 'subtotal']),
  operator: z.enum(['eq', 'gt', 'lt', 'gte', 'lte']),
  value: z.union([z.string(), z.number()]),
});

export const ModifierTypeSchema = z.enum(['percentage', 'flat']);

export const ModifierSchema = z.object({
  id: z.string().min(1),
  label: LocalizedStringSchema,
  type: ModifierTypeSchema,
  value: z.number(),
  conditions: z.array(ModifierConditionSchema).optional(),
});

export const KnowledgeBaseSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  languages: z.array(LanguageSchema).min(1),
  defaultLanguage: LanguageSchema,
  currency: CurrencySchema,
  items: z.array(ServiceItemSchema).min(1),
  rules: z.array(PricingRuleSchema),
  modifiers: z.array(ModifierSchema),
  markupPercent: z.number().nonnegative(),
  taxPercent: z.number().nonnegative(),
  notes: LocalizedStringSchema.optional(),
});

export const IntakeImageSchema = z.object({
  kind: z.enum(['photo', 'panoramic_xray', 'document']),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().min(1),
});

export const IntakeRequestSchema = z.object({
  clientId: z.string().min(1),
  language: LanguageSchema,
  freeText: z.string().min(1),
  requestedModifierIds: z.array(z.string()).optional(),
  images: z.array(IntakeImageSchema).optional(),
});

// Schema for what the LLM returns (validated against KB after parsing)
export const MappedLineSelectionSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().positive(),
  modifierIds: z.array(z.string()).optional(),
});

export const MappedIntakeSchema = z.object({
  lines: z.array(MappedLineSelectionSchema).min(1),
  quoteModifierIds: z.array(z.string()),
  notes: z.string().optional(),
});
