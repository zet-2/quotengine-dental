import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { dentalClinicKB } from '../clients/dental-clinic.js';
import { ClaudeDentalVisionMapper } from '../dental/ClaudeDentalVisionMapper.js';
import type { DentalVisionMapper } from '../dental/DentalVisionMapper.js';
import { generateDentalQuote, type DentalQuoteResult } from '../dental/generateDentalQuote.js';
import { toPatientDentalResult } from '../dental/patientResult.js';
import type { Language } from '../domain/types.js';
import {
  COMMERCIAL_CATALOG_VERSION,
  createDemoFullArchResult,
} from '../dental/commercialCatalog.js';
import {
  buildPatientIntentText,
  PATIENT_TARGET_AREAS,
  PATIENT_TREATMENT_GOALS,
} from '../dental/patientIntent.js';
import { requireAdmin, requireLeadAccess, requireStagingAccess } from './auth.js';
import { getRuntimeConfig, type RuntimeConfig } from './config.js';
import { createAccessToken, sha256Hex } from './crypto.js';
import { bytesToBase64 } from './encoding.js';
import { HttpError } from './errors.js';
import {
  createSubmissionFingerprints,
  requireIdempotencyKey,
  requireMatchingSubmission,
} from './idempotency.js';
import {
  createLead,
  decryptLeadRow,
  deleteLead,
  deleteLeadWithAudit,
  getAccessibleLeadRow,
  getStoredLead,
  getStoredLeadByIdempotencyKeyHash,
  listStoredLeads,
  recordAuditEvent,
  transitionLead,
  withdrawRadiographStorage,
} from './storage.js';
import { enforceRequestSize, MAX_MULTIPART_BODY_BYTES, parseLeadSubmission } from './submission.js';
import { verifyTurnstile, type TurnstileVerifier } from './turnstile.js';
import type { LeadRow, LeadStatus, PrivateLeadPayload, StoredLeadStatus } from './types.js';

type WorkerHonoEnv = { Bindings: Env };

const RESPONSE_MESSAGES: Record<Language, {
  readonly ready: string;
  readonly consultation: string;
  readonly followUp: string;
  readonly processing: string;
}> = {
  it: {
    ready: 'La tua stima indicativa è pronta. La clinica ti ricontatterà per confermarla in presenza.',
    consultation: 'Richiesta ricevuta. I dati forniti non consentono una stima automatica affidabile: la clinica ti ricontatterà.',
    followUp: 'Richiesta ricevuta. Non è stato possibile generare subito la stima: la clinica ti ricontatterà.',
    processing: 'Richiesta già ricevuta. La stima è ancora in elaborazione.',
  },
  sq: {
    ready: 'Vlerësimi yt orientues është gati. Klinika do të të kontaktojë për ta konfirmuar në konsultë.',
    consultation: 'Kërkesa u mor. Të dhënat e dhëna nuk lejojnë një vlerësim automatik të besueshëm; klinika do të të kontaktojë.',
    followUp: 'Kërkesa u mor. Vlerësimi nuk mund të gjenerohej menjëherë; klinika do të të kontaktojë.',
    processing: 'Kërkesa është marrë tashmë. Vlerësimi është ende duke u përpunuar.',
  },
  en: {
    ready: 'Your indicative estimate is ready. The clinic will contact you to confirm it in person.',
    consultation: 'Request received. The supplied information does not support a reliable automatic estimate; the clinic will contact you.',
    followUp: 'Request received. The estimate could not be generated immediately; the clinic will contact you.',
    processing: 'Request already received. The estimate is still processing.',
  },
};

export interface WorkerAppDeps {
  readonly mapperFactory?: (config: RuntimeConfig) => DentalVisionMapper;
  readonly turnstileVerifier?: TurnstileVerifier;
  readonly now?: () => Date;
}

function tokenFromHeader(request: Request): string {
  const token = request.headers.get('X-Turnstile-Token') ?? '';
  if (token.length < 1 || token.length > 2_048) {
    throw new HttpError(403, 'turnstile_token_required', 'Human verification is required');
  }
  return token;
}

function currentLeadStatus(status: StoredLeadStatus): LeadStatus {
  if (status === 'approved') return 'estimate_ready';
  if (status === 'pending_clinical_review' || status === 'rejected') {
    return 'processing_failed';
  }
  return status;
}

function publicLead(row: LeadRow): object {
  return {
    id: row.id,
    status: currentLeadStatus(row.status),
    language: row.language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    hasStoredRadiograph: row.image_key !== null,
    consent: {
      version: row.consent_version,
      capturedAt: row.consent_captured_at,
      radiographStorageGranted: row.radiograph_storage_consent === 1,
      radiographStorageActive: row.radiograph_storage_active === 1,
      radiographStorageWithdrawnAt: row.radiograph_storage_withdrawn_at,
      textSha256: row.consent_text_sha256,
      privacyNoticeUrl: row.privacy_notice_url,
      privacyNoticeSha256: row.privacy_notice_sha256,
    },
  };
}

function adminLeadSummary(row: LeadRow, payload: PrivateLeadPayload): object {
  return {
    ...publicLead(row),
    fullName: payload.fullName,
    phone: payload.phone,
    email: payload.email,
    contactPreference: payload.contactPreference,
    intent: payload.intent ?? null,
  };
}

function adminLead(row: LeadRow, payload: PrivateLeadPayload): object {
  return {
    ...publicLead(row),
    fullName: payload.fullName,
    phone: payload.phone,
    email: payload.email,
    contactPreference: payload.contactPreference,
    intent: payload.intent ?? null,
    message: payload.message,
    attribution: payload.attribution,
    result: payload.result,
    modelMetadata: {
      model: row.ai_model,
      pipelineVersion: row.pipeline_version,
      promptVersion: row.prompt_version,
      toolSchemaVersion: row.tool_schema_version,
      kbVersion: row.kb_version,
    },
    ...(payload.legacyClinicalReview
      ? { legacyClinicalReview: payload.legacyClinicalReview }
      : {}),
  };
}

function directLeadResponse(row: LeadRow, payload: PrivateLeadPayload): object {
  if (!payload.leadAccessToken) {
    throw new HttpError(500, 'idempotency_token_missing', 'Lead access token is unavailable');
  }
  const status = currentLeadStatus(row.status);
  const result = status === 'estimate_ready' && payload.result
    ? toPatientDentalResult(payload.result, payload.intent?.targetArea ?? null)
    : null;
  const messages = RESPONSE_MESSAGES[row.language];
  return {
    lead: publicLead(row),
    leadAccessToken: payload.leadAccessToken,
    outcome: status === 'estimate_ready'
      ? 'estimate_ready'
      : status === 'received'
        ? 'processing'
        : 'follow_up_required',
    result,
    message: status === 'received'
      ? messages.processing
      : status === 'processing_failed'
        ? messages.followUp
        : payload.result?.consultationOnly
          ? messages.consultation
          : messages.ready,
  };
}

function applySecurityHeaders(headers: Headers): void {
  headers.set('Cache-Control', 'no-store, private');
  headers.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
}

function logFailure(error: unknown): void {
  const entry = error instanceof HttpError
    ? { event: 'request_failed', code: error.code, status: error.status }
    : {
        event: 'request_failed',
        code: 'unhandled_error',
        errorType: error instanceof Error ? error.name : typeof error,
      };
  console.error(JSON.stringify(entry));
}

export function createWorkerApp(deps: WorkerAppDeps = {}): Hono<WorkerHonoEnv> {
  const app = new Hono<WorkerHonoEnv>();
  const now = deps.now ?? (() => new Date());
  const turnstileVerifier = deps.turnstileVerifier ?? verifyTurnstile;
  const mapperFactory = deps.mapperFactory ??
    ((config: RuntimeConfig) =>
      new ClaudeDentalVisionMapper(config.ANTHROPIC_API_KEY, config.ANTHROPIC_MODEL));

  app.use('*', async (c, next) => {
    try {
      await next();
    } finally {
      applySecurityHeaders(c.res.headers);
    }
  });

  app.use('/api/*', async (c, next) => {
    const config = getRuntimeConfig(c.env);
    const origin = c.req.header('Origin');
    if (origin && !config.allowedOrigins.has(origin)) {
      throw new HttpError(403, 'origin_not_allowed', 'Origin is not allowed');
    }
    if (origin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Vary', 'Origin');
    }
    if (c.req.method === 'OPTIONS') {
      c.header(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type, Idempotency-Key, X-Staging-Key, X-Turnstile-Token',
      );
      c.header('Access-Control-Allow-Methods', 'DELETE, GET, OPTIONS, POST');
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }
    await next();
  });

  app.use(
    '/api/leads',
    bodyLimit({
      maxSize: MAX_MULTIPART_BODY_BYTES,
      onError: () => {
        throw new HttpError(413, 'request_too_large', 'Multipart request is too large');
      },
    }),
  );
  app.get('/health', async (c) => {
    getRuntimeConfig(c.env);
    const schema = await c.env.LEADS_DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('leads', 'audit_events')",
    ).first<{ count: number }>();
    if (schema?.count !== 2) {
      throw new HttpError(500, 'database_not_migrated', 'Database schema is missing');
    }
    await c.env.LEADS_DB.prepare(
      `SELECT audit_ref, privacy_notice_sha256, radiograph_storage_active,
        idempotency_key_hash, pipeline_version, prompt_version, tool_schema_version, kb_version
       FROM leads LIMIT 1`,
    ).all();
    await c.env.RADIOGRAPHS.head('__quotengine_healthcheck__');
    return c.json({ status: 'ok', service: 'quotengine-api' });
  });

  app.get('/api/config', (c) => {
    const config = getRuntimeConfig(c.env);
    return c.json({
      consentVersion: config.CONSENT_VERSION,
      consentTextSha256: config.CONSENT_TEXT_SHA256,
      privacyNoticeSha256: config.PRIVACY_NOTICE_SHA256,
      privacyNoticeUrl: config.PRIVACY_NOTICE_URL,
      dataRetentionDays: config.DATA_RETENTION_DAYS,
      acceptedImageTypes: ['image/jpeg', 'image/png'],
      maxMultipartBodyBytes: MAX_MULTIPART_BODY_BYTES,
      turnstile: {
        siteKey: config.TURNSTILE_SITE_KEY,
        action: config.TURNSTILE_EXPECTED_ACTION,
        tokenHeader: 'X-Turnstile-Token',
      },
      idempotencyHeader: 'Idempotency-Key',
      treatmentGoals: PATIENT_TREATMENT_GOALS,
      targetAreas: PATIENT_TARGET_AREAS,
      demoCommercialCatalog: {
        version: COMMERCIAL_CATALOG_VERSION,
        status: 'synthetic_demo_catalog',
      },
    });
  });

  app.post('/api/leads', async (c) => {
    const config = getRuntimeConfig(c.env);
    await requireStagingAccess(c.req.raw, config);
    enforceRequestSize(c.req.raw);
    const correlationId = crypto.randomUUID();
    const idempotencyKeyHash = await sha256Hex(requireIdempotencyKey(c.req.raw));
    const source = c.req.header('CF-Connecting-IP') ?? 'local-or-unknown';
    const sourceRateLimitKey = await sha256Hex(`${config.ADMIN_API_KEY}\u0000source\u0000${source}`);
    const sourceRateLimit = await c.env.SUBMISSION_IP_RATE_LIMITER.limit({
      key: sourceRateLimitKey,
    });
    if (!sourceRateLimit.success) {
      throw new HttpError(429, 'rate_limit_exceeded', 'Too many recent submissions');
    }
    const turnstile = await turnstileVerifier(tokenFromHeader(c.req.raw), c.req.raw, config);
    const submission = await parseLeadSubmission(c.req.raw, c.env.IMAGES, config);
    const submissionFingerprints = await createSubmissionFingerprints(submission);
    const submissionFingerprint = submissionFingerprints.current;
    const compatibleLegacyFingerprint =
      submission.intent.treatmentGoal === 'unsure' && submission.intent.targetArea === 'both'
        ? submissionFingerprints.legacyWithoutIntent
        : undefined;
    const replay = await getStoredLeadByIdempotencyKeyHash(
      c.env,
      config,
      idempotencyKeyHash,
      now(),
    );
    if (replay) {
      requireMatchingSubmission(
        replay.payload,
        submissionFingerprint,
        compatibleLegacyFingerprint,
      );
      const body = directLeadResponse(replay.row, replay.payload);
      return currentLeadStatus(replay.row.status) === 'received'
        ? c.json(body, 202)
        : c.json(body, 200);
    }
    const [phoneRateLimitKey, emailRateLimitKey] = await Promise.all([
      sha256Hex(`${config.ADMIN_API_KEY}\u0000phone\u0000${submission.phone.replace(/\D/g, '')}`),
      sha256Hex(`${config.ADMIN_API_KEY}\u0000email\u0000${submission.email}`),
    ]);
    const [phoneRateLimit, emailRateLimit] = await Promise.all([
      c.env.SUBMISSION_RATE_LIMITER.limit({ key: phoneRateLimitKey }),
      c.env.SUBMISSION_RATE_LIMITER.limit({ key: emailRateLimitKey }),
    ]);
    if (!phoneRateLimit.success || !emailRateLimit.success) {
      throw new HttpError(429, 'rate_limit_exceeded', 'Too many recent submissions');
    }
    const leadId = crypto.randomUUID();
    const leadAccessToken = createAccessToken();
    const createdAt = now();

    try {
      await createLead(c.env, config, {
        id: leadId,
        accessToken: leadAccessToken,
        idempotencyKeyHash,
        submissionFingerprint,
        submission,
        turnstileHostname: turnstile.hostname,
        now: createdAt,
      });
    } catch (error) {
      // A concurrent retry can win the unique idempotency-key insert. Recover
      // the original lead/token instead of charging for a second inference.
      const concurrentReplay = await getStoredLeadByIdempotencyKeyHash(
        c.env,
        config,
        idempotencyKeyHash,
        now(),
      );
      if (!concurrentReplay) throw error;
      requireMatchingSubmission(
        concurrentReplay.payload,
        submissionFingerprint,
        compatibleLegacyFingerprint,
      );
      const body = directLeadResponse(concurrentReplay.row, concurrentReplay.payload);
      return currentLeadStatus(concurrentReplay.row.status) === 'received'
        ? c.json(body, 202)
        : c.json(body, 200);
    }

    const initialPayload: PrivateLeadPayload = {
      fullName: submission.fullName,
      phone: submission.phone,
      email: submission.email,
      contactPreference: submission.contactPreference,
      message: submission.message,
      attribution: submission.attribution,
      intent: submission.intent,
      result: null,
      leadAccessToken,
      submissionFingerprint,
    };
    const inferenceStartedAt = Date.now();
    let generatedResult: DentalQuoteResult | null = null;
    if (submission.intent.treatmentGoal === 'fixed_full_arch') {
      generatedResult = createDemoFullArchResult(
        submission.intent.targetArea,
        submission.language,
      );
    } else {
      try {
        const image = submission.image;
        if (!image) {
          throw new HttpError(422, 'image_required', 'A panoramic radiograph is required');
        }
        generatedResult = await generateDentalQuote(
          dentalClinicKB,
          {
            clientId: dentalClinicKB.clientId,
            language: submission.language,
            freeText: buildPatientIntentText(
              submission.intent.treatmentGoal,
              submission.intent.targetArea,
              submission.message,
              submission.language,
            ),
            images: [
              {
                kind: 'panoramic_xray',
                mediaType: image.mediaType,
                data: bytesToBase64(image.bytes),
              },
            ],
          },
          mapperFactory(config),
          undefined,
          { targetArea: submission.intent.targetArea },
        );
      } catch (error) {
        console.error(JSON.stringify({
          event: 'ai_estimate_failed',
          correlationId,
          durationMs: Date.now() - inferenceStartedAt,
          errorType: error instanceof Error ? error.name : typeof error,
        }));
      }
    }

    if (generatedResult) {
      await transitionLead(
        c.env,
        config,
        leadId,
        'received',
        'estimate_ready',
        { ...initialPayload, result: generatedResult },
        now(),
      );
      console.log(JSON.stringify({
        event: 'estimate_ready',
        correlationId,
        durationMs: Date.now() - inferenceStartedAt,
        resultBasis: generatedResult.resultBasis,
        consultationOnly: generatedResult.consultationOnly,
      }));
    } else {
      await transitionLead(
        c.env,
        config,
        leadId,
        'received',
        'processing_failed',
        initialPayload,
        now(),
      );
    }

    const processedRow = await getAccessibleLeadRow(c.env, leadId, now());
    if (!processedRow) throw new HttpError(500, 'lead_processing_lost', 'Lead processing state was lost');
    return c.json(directLeadResponse(processedRow, {
      ...initialPayload,
      result: generatedResult,
    }), 201);
  });

  app.get('/api/admin/leads', async (c) => {
    const config = getRuntimeConfig(c.env);
    const actor = await requireAdmin(c.req.raw, config);
    const requestedAt = now();
    const limit = Math.min(20, Math.max(1, Number(c.req.query('limit') ?? 10) || 10));
    const before = c.req.query('before');
    const leads = await listStoredLeads(c.env, config, limit, requestedAt, before);
    await recordAuditEvent(c.env, '-', 'admin_list', actor, requestedAt);
    return c.json({ leads: leads.map(({ row, payload }) => adminLeadSummary(row, payload)) });
  });

  app.get('/api/admin/leads/:id', async (c) => {
    const config = getRuntimeConfig(c.env);
    const actor = await requireAdmin(c.req.raw, config);
    const requestedAt = now();
    const lead = await getStoredLead(c.env, config, c.req.param('id'), requestedAt);
    if (!lead) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    await recordAuditEvent(c.env, lead.row.audit_ref, 'admin_read', actor, requestedAt);
    return c.json({ lead: adminLead(lead.row, lead.payload) });
  });

  app.get('/api/admin/leads/:id/radiograph', async (c) => {
    const config = getRuntimeConfig(c.env);
    const actor = await requireAdmin(c.req.raw, config);
    const requestedAt = now();
    const row = await getAccessibleLeadRow(c.env, c.req.param('id'), requestedAt);
    if (!row) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    if (!row.image_key) throw new HttpError(404, 'radiograph_not_stored', 'Radiograph was not stored');
    const object = await c.env.RADIOGRAPHS.get(row.image_key);
    if (!object) throw new HttpError(404, 'radiograph_not_found', 'Radiograph not found');
    await recordAuditEvent(
      c.env,
      row.audit_ref,
      'radiograph_downloaded',
      actor,
      requestedAt,
    );
    const headers = new Headers({
      'Content-Type': row.image_media_type ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${row.id}.jpg"`,
    });
    applySecurityHeaders(headers);
    return new Response(object.body, { headers });
  });

  app.get('/api/leads/:id/status', async (c) => {
    const config = getRuntimeConfig(c.env);
    const row = await getAccessibleLeadRow(c.env, c.req.param('id'), now());
    if (!row) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    await requireLeadAccess(c.req.raw, row.deletion_token_hash, config);
    const payload = await decryptLeadRow(config, row);
    return c.json({
      lead: publicLead(row),
      result: currentLeadStatus(row.status) === 'estimate_ready' && payload.result
        ? toPatientDentalResult(payload.result, payload.intent?.targetArea ?? null)
        : null,
    });
  });

  app.delete('/api/leads/:id/radiograph', async (c) => {
    const config = getRuntimeConfig(c.env);
    const requestedAt = now();
    const row = await getAccessibleLeadRow(c.env, c.req.param('id'), requestedAt);
    if (!row) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    const actor = await requireLeadAccess(c.req.raw, row.deletion_token_hash, config);
    await withdrawRadiographStorage(c.env, row, actor, requestedAt);
    return c.body(null, 204);
  });

  app.delete('/api/leads/:id', async (c) => {
    const config = getRuntimeConfig(c.env);
    const requestedAt = now();
    const row = await getAccessibleLeadRow(c.env, c.req.param('id'), requestedAt);
    if (!row) throw new HttpError(404, 'lead_not_found', 'Lead not found');
    const actor = await requireLeadAccess(c.req.raw, row.deletion_token_hash, config);
    await recordAuditEvent(
      c.env,
      row.audit_ref,
      'lead_deletion_requested',
      actor,
      requestedAt,
    );
    await deleteLeadWithAudit(c.env, row, actor, requestedAt);
    return c.body(null, 204);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));
  app.onError((error, c) => {
    logFailure(error);
    if (error instanceof HttpError) {
      const message = error.status >= 500 ? 'Internal server error' : error.message;
      return c.json({ error: { code: error.code, message } }, error.status);
    }
    return c.json({ error: { code: 'internal_error', message: 'Internal server error' } }, 500);
  });

  return app;
}
