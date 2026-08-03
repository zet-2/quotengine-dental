import type { DentalQuoteResult } from '../dental/generateDentalQuote.js';
import type { Language } from '../domain/types.js';
import type { PatientDentalIntent } from '../dental/patientIntent.js';

export type LeadStatus =
  | 'received'
  | 'estimate_ready'
  | 'processing_failed';

export type StoredLeadStatus = LeadStatus
  | 'pending_clinical_review'
  | 'approved'
  | 'rejected';

export type ContactPreference = 'whatsapp' | 'phone' | 'email';

export interface LeadAttribution {
  readonly source?: string;
  readonly medium?: string;
  readonly campaign?: string;
  readonly term?: string;
  readonly content?: string;
  readonly landingPath?: string;
}

export interface PrivateLeadPayload {
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
  readonly contactPreference: ContactPreference;
  readonly message: string;
  readonly attribution: LeadAttribution;
  readonly intent?: PatientDentalIntent;
  readonly result: DentalQuoteResult | null;
  /** Stored encrypted so an idempotent retry can recover the original bearer token. */
  readonly leadAccessToken?: string;
  /** Hash of the normalized form and image; prevents cross-submission key reuse. */
  readonly submissionFingerprint?: string;
  /** Preserved only for rows created by the removed v1 clinical-review flow. */
  readonly legacyClinicalReview?: {
    readonly decision: 'approved' | 'rejected';
    readonly reviewer: string;
    readonly reviewedAt: string;
    readonly note?: string;
  } | null;
}

export interface ValidatedImage {
  readonly bytes: Uint8Array;
  readonly mediaType: 'image/jpeg' | 'image/png';
  readonly extension: 'jpg' | 'png';
  readonly width: number;
  readonly height: number;
}

export interface LeadSubmission {
  readonly fullName: string;
  readonly phone: string;
  readonly email: string;
  readonly contactPreference: ContactPreference;
  readonly message: string;
  readonly attribution: LeadAttribution;
  readonly intent: PatientDentalIntent;
  readonly language: Language;
  readonly healthDataConsent: true;
  readonly radiographStorageConsent: boolean;
  readonly consentVersion: string;
  readonly consentTextSha256: string;
  readonly privacyNoticeUrl: string;
  readonly privacyNoticeSha256: string;
  /** Optional only for the patient-declared commercial full-arch scenario. */
  readonly image: ValidatedImage | null;
}

export interface LeadRow {
  readonly id: string;
  readonly audit_ref: string;
  readonly language: Language;
  readonly status: StoredLeadStatus;
  readonly created_at: string;
  readonly updated_at: string;
  readonly expires_at: string;
  readonly image_key: string | null;
  readonly image_media_type: string | null;
  readonly image_size: number | null;
  readonly health_data_consent: 1;
  readonly radiograph_storage_consent: 0 | 1;
  readonly radiograph_storage_active: 0 | 1;
  readonly radiograph_storage_withdrawn_at: string | null;
  readonly consent_version: string;
  readonly consent_text_sha256: string;
  readonly consent_captured_at: string;
  readonly privacy_notice_url: string;
  readonly privacy_notice_sha256: string;
  readonly turnstile_hostname: string;
  readonly deletion_token_hash: string;
  readonly idempotency_key_hash: string | null;
  readonly ai_model: string;
  readonly pipeline_version: string;
  readonly prompt_version: string;
  readonly tool_schema_version: string;
  readonly kb_version: string;
  readonly private_payload: string;
}

export interface TurnstileResult {
  readonly success: true;
  readonly hostname: string;
  readonly action: string;
}
