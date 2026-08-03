import { z } from 'zod';
import { LanguageSchema } from '../domain/schemas.js';
import type { RuntimeConfig } from './config.js';
import { HttpError } from './errors.js';
import { validateAndSanitizeImage } from './image.js';
import type { LeadSubmission } from './types.js';
import { PATIENT_TARGET_AREAS, PATIENT_TREATMENT_GOALS } from '../dental/patientIntent.js';

export const MAX_MULTIPART_BODY_BYTES = 7 * 1024 * 1024;

const TextFieldsSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string()
    .trim()
    .min(7)
    .max(32)
    .regex(/^\+?[0-9() .-]+$/)
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  contactPreference: z.enum(['whatsapp', 'phone', 'email']),
  treatmentGoal: z.preprocess(
    (value) => value === '' ? 'unsure' : value,
    z.enum(PATIENT_TREATMENT_GOALS),
  ),
  targetArea: z.preprocess(
    (value) => value === '' ? 'both' : value,
    z.enum(PATIENT_TARGET_AREAS),
  ),
  message: z.string().trim().max(2_000),
  utmSource: z.string().trim().max(200).transform((value) => value || undefined),
  utmMedium: z.string().trim().max(200).transform((value) => value || undefined),
  utmCampaign: z.string().trim().max(200).transform((value) => value || undefined),
  utmTerm: z.string().trim().max(200).transform((value) => value || undefined),
  utmContent: z.string().trim().max(200).transform((value) => value || undefined),
  landingPath: z.string()
    .trim()
    .max(500)
    .refine((value) => value === '' || /^\/(?!\/)/.test(value))
    .transform((value) => value || undefined),
  language: LanguageSchema,
  healthDataConsent: z.literal('true'),
  radiographStorageConsent: z.enum(['true', 'false']),
  consentVersion: z.string().min(1).max(100),
  consentTextSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  privacyNoticeSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

function requiredText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function enforceRequestSize(request: Request): void {
  const value = request.headers.get('Content-Length');
  if (!value) return;
  const length = Number(value);
  if (!Number.isFinite(length) || length < 0) {
    throw new HttpError(400, 'invalid_content_length', 'Invalid Content-Length header');
  }
  if (length > MAX_MULTIPART_BODY_BYTES) {
    throw new HttpError(413, 'request_too_large', 'Multipart request is too large');
  }
}

export async function parseLeadSubmission(
  request: Request,
  images: ImagesBinding,
  config: RuntimeConfig,
): Promise<LeadSubmission> {
  enforceRequestSize(request);
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
    throw new HttpError(400, 'invalid_content_type', 'Expected multipart/form-data');
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'invalid_multipart', 'Malformed multipart request');
  }
  const fields = TextFieldsSchema.safeParse({
    fullName: requiredText(form, 'fullName'),
    phone: requiredText(form, 'phone'),
    email: requiredText(form, 'email'),
    contactPreference: requiredText(form, 'contactPreference'),
    treatmentGoal: requiredText(form, 'treatmentGoal'),
    targetArea: requiredText(form, 'targetArea'),
    message: requiredText(form, 'message'),
    utmSource: requiredText(form, 'utmSource'),
    utmMedium: requiredText(form, 'utmMedium'),
    utmCampaign: requiredText(form, 'utmCampaign'),
    utmTerm: requiredText(form, 'utmTerm'),
    utmContent: requiredText(form, 'utmContent'),
    landingPath: requiredText(form, 'landingPath'),
    language: requiredText(form, 'language'),
    healthDataConsent: requiredText(form, 'healthDataConsent'),
    radiographStorageConsent: requiredText(form, 'radiographStorageConsent'),
    consentVersion: requiredText(form, 'consentVersion'),
    consentTextSha256: requiredText(form, 'consentTextSha256'),
    privacyNoticeSha256: requiredText(form, 'privacyNoticeSha256'),
  });
  if (!fields.success) {
    const field = fields.error.issues[0]?.path.join('.') ?? 'form';
    throw new HttpError(422, 'invalid_submission', `Invalid or missing field: ${field}`);
  }
  const language = fields.data.language;
  if (
    fields.data.consentVersion !== config.CONSENT_VERSION ||
    fields.data.consentTextSha256 !== config.CONSENT_TEXT_SHA256[language] ||
    fields.data.privacyNoticeSha256 !== config.PRIVACY_NOTICE_SHA256[language]
  ) {
    throw new HttpError(
      409,
      'consent_copy_changed',
      'The consent or privacy notice changed; reload it before submitting',
    );
  }

  const imageValue = form.get('image');
  const shouldProcessImage = fields.data.treatmentGoal !== 'fixed_full_arch' ||
    fields.data.radiographStorageConsent === 'true';
  const image = shouldProcessImage && imageValue instanceof File
    ? await validateAndSanitizeImage(imageValue, images)
    : null;
  if (!image && fields.data.treatmentGoal !== 'fixed_full_arch') {
    throw new HttpError(422, 'image_required', 'A panoramic radiograph is required');
  }
  if (!image && fields.data.radiographStorageConsent === 'true') {
    throw new HttpError(
      422,
      'image_required_for_storage',
      'Radiograph storage consent requires an uploaded radiograph',
    );
  }
  return {
    fullName: fields.data.fullName,
    phone: fields.data.phone,
    email: fields.data.email,
    contactPreference: fields.data.contactPreference,
    intent: {
      treatmentGoal: fields.data.treatmentGoal,
      targetArea: fields.data.targetArea,
    },
    message: fields.data.message,
    attribution: {
      ...(fields.data.utmSource ? { source: fields.data.utmSource } : {}),
      ...(fields.data.utmMedium ? { medium: fields.data.utmMedium } : {}),
      ...(fields.data.utmCampaign ? { campaign: fields.data.utmCampaign } : {}),
      ...(fields.data.utmTerm ? { term: fields.data.utmTerm } : {}),
      ...(fields.data.utmContent ? { content: fields.data.utmContent } : {}),
      ...(fields.data.landingPath ? { landingPath: fields.data.landingPath } : {}),
    },
    language,
    healthDataConsent: true,
    radiographStorageConsent: fields.data.radiographStorageConsent === 'true',
    consentVersion: fields.data.consentVersion,
    consentTextSha256: fields.data.consentTextSha256.toLowerCase(),
    privacyNoticeUrl: config.PRIVACY_NOTICE_URL,
    privacyNoticeSha256: fields.data.privacyNoticeSha256.toLowerCase(),
    image,
  };
}
