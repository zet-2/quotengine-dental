/**
 * Zod schemas for the dental vision-intake domain.
 * Used to validate model (Claude) output before it is trusted.
 */
import { z } from 'zod';
import { MAX_AUTO_QUOTE_CANDIDATES } from './autoQuotePolicy.js';

export const ArchSchema = z.enum(['upper', 'lower']);
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const ImageQualitySchema = z.enum(['good', 'fair', 'poor']);

export const ArchFindingSchema = z.object({
  arch: ArchSchema,
  observation: z.string().min(1),
  confidence: ConfidenceSchema,
});

export const CandidateTreatmentSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.number().int().min(1).max(32),
  arch: ArchSchema,
  rationale: z.string().min(1),
  needsConfirmation: z.boolean(),
});

export const RestorationTypeSchema = z.enum([
  'implant',
  'crown',
  'bridge',
  'post',
  'denture',
  'other',
]);

export const ExistingRestorationSchema = z.object({
  type: RestorationTypeSchema,
  arch: ArchSchema.optional(),
  count: z.number().int().min(1).max(32),
  note: z.string().optional(),
});

export const DentalAssessmentSchema = z.object({
  archFindings: z.array(ArchFindingSchema).default([]),
  candidateTreatments: z.array(CandidateTreatmentSchema).max(MAX_AUTO_QUOTE_CANDIDATES).default([]),
  existingRestorations: z.array(ExistingRestorationSchema).optional(),
  imageQuality: ImageQualitySchema.default('poor'),
  overallConfidence: ConfidenceSchema.default('low'),
  requiresClinicalConfirmation: z.boolean().default(true),
  notes: z.string().optional(),
});
