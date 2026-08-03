import type { RuntimeConfig } from './config.js';
import {
  DENTAL_KB_VERSION,
  DENTAL_PIPELINE_VERSION,
  DENTAL_PROMPT_VERSION,
  DENTAL_TOOL_SCHEMA_VERSION,
} from '../dental/modelMetadata.js';
import { COMMERCIAL_CATALOG_VERSION } from '../dental/commercialCatalog.js';
import { decryptPrivatePayload, encryptPrivatePayload, sha256Hex } from './crypto.js';
import { HttpError } from './errors.js';
import type {
  LeadRow,
  LeadStatus,
  LeadSubmission,
  PrivateLeadPayload,
} from './types.js';

interface CreateLeadInput {
  readonly id: string;
  readonly accessToken: string;
  readonly idempotencyKeyHash: string;
  readonly submissionFingerprint: string;
  readonly submission: LeadSubmission;
  readonly turnstileHostname: string;
  readonly now: Date;
}

export interface StoredLead {
  readonly row: LeadRow;
  readonly payload: PrivateLeadPayload;
}

export type AuditEventType =
  | 'admin_list'
  | 'admin_read'
  | 'radiograph_downloaded'
  | 'radiograph_storage_withdrawn'
  | 'lead_deletion_requested'
  | 'lead_deleted';

export interface PurgeResult {
  readonly deleted: number;
  readonly hasMore: boolean;
}

const PURGE_BATCH_SIZE = 40;

function retentionDate(now: Date, days: number): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1_000);
}

function objectKey(id: string, extension: 'jpg' | 'png', now: Date): string {
  const month = now.toISOString().slice(0, 7);
  return `radiographs/${month}/${id}.${extension}`;
}

async function putRadiograph(
  env: Env,
  config: RuntimeConfig,
  input: CreateLeadInput,
  expiresAt: string,
): Promise<string | null> {
  const image = input.submission.image;
  if (!input.submission.radiographStorageConsent || !image) return null;
  const key = objectKey(input.id, image.extension, input.now);
  await env.RADIOGRAPHS.put(key, image.bytes, {
    httpMetadata: { contentType: image.mediaType },
    customMetadata: {
      expiresAt,
      consentVersion: config.CONSENT_VERSION,
      width: String(image.width),
      height: String(image.height),
    },
  });
  return key;
}

export async function createLead(
  env: Env,
  config: RuntimeConfig,
  input: CreateLeadInput,
): Promise<LeadRow> {
  const createdAt = input.now.toISOString();
  const expiresAt = retentionDate(input.now, config.DATA_RETENTION_DAYS).toISOString();
  const deletionTokenHash = await sha256Hex(input.accessToken);
  const payload = await encryptPrivatePayload(
    {
      fullName: input.submission.fullName,
      phone: input.submission.phone,
      email: input.submission.email,
      contactPreference: input.submission.contactPreference,
      message: input.submission.message,
      attribution: input.submission.attribution,
      intent: input.submission.intent,
      result: null,
      leadAccessToken: input.accessToken,
      submissionFingerprint: input.submissionFingerprint,
    },
    input.id,
    config.DATA_ENCRYPTION_KEY,
  );
  let imageKey: string | null = null;
  try {
    imageKey = await putRadiograph(env, config, input, expiresAt);
  } catch (error) {
    // Storage is optional. Keep the consent record and lead even when R2 is
    // temporarily unavailable; radiograph_storage_active remains false.
    console.error(JSON.stringify({
      event: 'radiograph_storage_failed',
      errorType: error instanceof Error ? error.name : typeof error,
    }));
  }
  const auditRef = crypto.randomUUID();

  try {
    await env.LEADS_DB.prepare(
      `INSERT INTO leads (
        id, audit_ref, language, status, created_at, updated_at, expires_at,
        image_key, image_media_type, image_size,
        health_data_consent, radiograph_storage_consent, radiograph_storage_active,
        radiograph_storage_withdrawn_at,
        consent_version, consent_text_sha256, consent_captured_at,
        privacy_notice_url, privacy_notice_sha256,
        turnstile_hostname, deletion_token_hash, idempotency_key_hash, ai_model,
        pipeline_version, prompt_version, tool_schema_version, kb_version,
        private_payload
      ) VALUES (?, ?, ?, 'received', ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        input.id,
        auditRef,
        input.submission.language,
        createdAt,
        createdAt,
        expiresAt,
        imageKey,
        imageKey ? input.submission.image?.mediaType ?? null : null,
        imageKey ? input.submission.image?.bytes.byteLength ?? null : null,
        input.submission.radiographStorageConsent ? 1 : 0,
        imageKey ? 1 : 0,
        input.submission.consentVersion,
        input.submission.consentTextSha256,
        createdAt,
        input.submission.privacyNoticeUrl,
        input.submission.privacyNoticeSha256,
        input.turnstileHostname,
        deletionTokenHash,
        input.idempotencyKeyHash,
        input.submission.intent.treatmentGoal === 'fixed_full_arch'
          ? 'not_used'
          : config.ANTHROPIC_MODEL,
        DENTAL_PIPELINE_VERSION,
        input.submission.intent.treatmentGoal === 'fixed_full_arch'
          ? 'not_used'
          : DENTAL_PROMPT_VERSION,
        input.submission.intent.treatmentGoal === 'fixed_full_arch'
          ? 'not_used'
          : DENTAL_TOOL_SCHEMA_VERSION,
        input.submission.intent.treatmentGoal === 'fixed_full_arch'
          ? COMMERCIAL_CATALOG_VERSION
          : DENTAL_KB_VERSION,
        payload,
      )
      .run();
  } catch (error) {
    if (imageKey) {
      try {
        await env.RADIOGRAPHS.delete(imageKey);
      } catch (cleanupError) {
        console.error(JSON.stringify({
          event: 'orphan_radiograph_cleanup_failed',
          errorType: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
        }));
      }
    }
    throw error;
  }

  const row = await getLeadRow(env.LEADS_DB, input.id);
  if (!row) throw new Error('Lead insert succeeded but the row could not be read');
  return row;
}

export async function getLeadRow(db: D1Database, id: string): Promise<LeadRow | null> {
  return db.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LeadRow>();
}

export async function getLeadRowByIdempotencyKeyHash(
  db: D1Database,
  idempotencyKeyHash: string,
): Promise<LeadRow | null> {
  return db.prepare('SELECT * FROM leads WHERE idempotency_key_hash = ?')
    .bind(idempotencyKeyHash)
    .first<LeadRow>();
}

export async function getAccessibleLeadRow(
  env: Env,
  id: string,
  now: Date,
): Promise<LeadRow | null> {
  const row = await getLeadRow(env.LEADS_DB, id);
  if (!row) return null;
  if (row.expires_at > now.toISOString()) return row;
  await deleteLead(env, row);
  return null;
}

export async function decryptLeadRow(
  config: RuntimeConfig,
  row: LeadRow,
): Promise<PrivateLeadPayload> {
  return decryptPrivatePayload(row.private_payload, row.id, config.DATA_ENCRYPTION_KEY);
}

export async function getStoredLead(
  env: Env,
  config: RuntimeConfig,
  id: string,
  now = new Date(),
): Promise<StoredLead | null> {
  const row = await getAccessibleLeadRow(env, id, now);
  if (!row) return null;
  const payload = await decryptLeadRow(config, row);
  return { row, payload };
}

export async function getStoredLeadByIdempotencyKeyHash(
  env: Env,
  config: RuntimeConfig,
  idempotencyKeyHash: string,
  now = new Date(),
): Promise<StoredLead | null> {
  const row = await getLeadRowByIdempotencyKeyHash(env.LEADS_DB, idempotencyKeyHash);
  if (!row) return null;
  if (row.expires_at <= now.toISOString()) {
    await deleteLead(env, row);
    return null;
  }
  return { row, payload: await decryptLeadRow(config, row) };
}

export async function transitionLead(
  env: Env,
  config: RuntimeConfig,
  id: string,
  fromStatus: LeadStatus,
  status: LeadStatus,
  payload: PrivateLeadPayload,
  now: Date,
): Promise<void> {
  const encrypted = await encryptPrivatePayload(payload, id, config.DATA_ENCRYPTION_KEY);
  const result = await env.LEADS_DB.prepare(
    'UPDATE leads SET status = ?, private_payload = ?, updated_at = ? WHERE id = ? AND status = ?',
  )
    .bind(status, encrypted, now.toISOString(), id, fromStatus)
    .run();
  if (result.meta.changes !== 1) {
    throw new HttpError(409, 'invalid_lead_transition', 'The lead status changed; reload and retry');
  }
}

export async function listStoredLeads(
  env: Env,
  config: RuntimeConfig,
  limit: number,
  now: Date,
  before?: string,
): Promise<readonly StoredLead[]> {
  const statement = before
    ? env.LEADS_DB.prepare(
        'SELECT * FROM leads WHERE expires_at > ? AND created_at < ? ORDER BY created_at DESC LIMIT ?',
      ).bind(now.toISOString(), before, limit)
    : env.LEADS_DB.prepare(
        'SELECT * FROM leads WHERE expires_at > ? ORDER BY created_at DESC LIMIT ?',
      ).bind(now.toISOString(), limit);
  const rows = await statement.all<LeadRow>();
  return Promise.all(
    rows.results.map(async (row) => ({
      row,
      payload: await decryptLeadRow(config, row),
    })),
  );
}

export async function deleteLead(env: Env, row: LeadRow): Promise<void> {
  if (row.image_key) await env.RADIOGRAPHS.delete(row.image_key);
  await env.LEADS_DB.prepare('DELETE FROM leads WHERE id = ?').bind(row.id).run();
}

export async function deleteLeadWithAudit(
  env: Env,
  row: LeadRow,
  actor: string,
  now: Date,
): Promise<void> {
  if (row.image_key) await env.RADIOGRAPHS.delete(row.image_key);
  const timestamp = now.toISOString();
  try {
    const results = await env.LEADS_DB.batch([
      env.LEADS_DB.prepare('DELETE FROM leads WHERE id = ?').bind(row.id),
      env.LEADS_DB.prepare(
        `INSERT INTO audit_events (id, lead_ref, event_type, actor, occurred_at)
         VALUES (?, ?, CASE WHEN changes() = 1 THEN 'lead_deleted' ELSE NULL END, ?, ?)`,
      ).bind(crypto.randomUUID(), row.audit_ref, actor.slice(0, 200), timestamp),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
      throw new Error('Atomic deletion did not update both state and audit');
    }
  } catch (error) {
    if (!(await getLeadRow(env.LEADS_DB, row.id))) return;
    throw error;
  }
}

export async function withdrawRadiographStorage(
  env: Env,
  row: LeadRow,
  actor: string,
  now: Date,
): Promise<boolean> {
  if (row.radiograph_storage_consent === 0 || row.radiograph_storage_withdrawn_at !== null) {
    return false;
  }
  if (row.radiograph_storage_active === 1 && row.image_key) {
    await env.RADIOGRAPHS.delete(row.image_key);
  }
  const timestamp = now.toISOString();
  try {
    const results = await env.LEADS_DB.batch([
      env.LEADS_DB.prepare(
        `UPDATE leads SET
          radiograph_storage_active = 0,
          radiograph_storage_withdrawn_at = ?,
          image_key = NULL,
          image_media_type = NULL,
          image_size = NULL,
          updated_at = ?
        WHERE id = ?
          AND radiograph_storage_consent = 1
          AND radiograph_storage_withdrawn_at IS NULL`,
      ).bind(timestamp, timestamp, row.id),
      env.LEADS_DB.prepare(
        `INSERT INTO audit_events (id, lead_ref, event_type, actor, occurred_at)
         VALUES (?, ?, CASE WHEN changes() = 1 THEN 'radiograph_storage_withdrawn' ELSE NULL END, ?, ?)`,
      ).bind(crypto.randomUUID(), row.audit_ref, actor.slice(0, 200), timestamp),
    ]);
    return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1;
  } catch (error) {
    const current = await getLeadRow(env.LEADS_DB, row.id);
    if (current?.radiograph_storage_withdrawn_at !== null) return false;
    throw error;
  }
}

export async function recordAuditEvent(
  env: Env,
  leadRef: string,
  eventType: AuditEventType,
  actor: string,
  now: Date,
): Promise<void> {
  await env.LEADS_DB.prepare(
    'INSERT INTO audit_events (id, lead_ref, event_type, actor, occurred_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), leadRef, eventType, actor.slice(0, 200), now.toISOString())
    .run();
}

export async function purgeExpiredLeadBatch(env: Env, now: Date): Promise<PurgeResult> {
  const rows = await env.LEADS_DB.prepare(
    'SELECT id, image_key FROM leads WHERE expires_at <= ? ORDER BY expires_at LIMIT ?',
  )
    .bind(now.toISOString(), PURGE_BATCH_SIZE)
    .all<{ id: string; image_key: string | null }>();

  const imageKeys = rows.results.flatMap((row) => (row.image_key ? [row.image_key] : []));
  if (imageKeys.length > 0) await env.RADIOGRAPHS.delete(imageKeys);
  if (rows.results.length === 0) return { deleted: 0, hasMore: false };

  const placeholders = rows.results.map(() => '?').join(', ');
  await env.LEADS_DB.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`)
    .bind(...rows.results.map((row) => row.id))
    .run();
  return { deleted: rows.results.length, hasMore: rows.results.length === PURGE_BATCH_SIZE };
}

export async function reconcileStaleReceived(
  env: Env,
  staleBefore: Date,
  now: Date,
): Promise<number> {
  const result = await env.LEADS_DB.prepare(
    `UPDATE leads SET status = 'processing_failed', updated_at = ?
     WHERE status = 'received' AND created_at <= ?`,
  )
    .bind(now.toISOString(), staleBefore.toISOString())
    .run();
  return result.meta.changes ?? 0;
}

export async function purgeExpiredAuditEvents(
  env: Env,
  now: Date,
  retentionDays: number,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1_000);
  const result = await env.LEADS_DB.prepare('DELETE FROM audit_events WHERE occurred_at <= ?')
    .bind(cutoff.toISOString())
    .run();
  return result.meta.changes ?? 0;
}
