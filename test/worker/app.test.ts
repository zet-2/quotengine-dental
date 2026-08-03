import { createExecutionContext, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DentalVisionMapper } from '../../src/dental/DentalVisionMapper.js';
import { MockDentalVisionMapper } from '../../src/dental/MockDentalVisionMapper.js';
import { createWorkerApp } from '../../src/worker/createApp.js';
import type { LeadRow } from '../../src/worker/types.js';
import { leadForm } from './helpers.js';

const ADMIN_KEY = 'admin-api-key-with-at-least-32-characters';
const STAGING_KEY = 'staging-api-key-with-at-least-32-characters';
const ORIGIN = 'http://localhost:4321';
const fixedNow = new Date('2026-07-13T10:00:00.000Z');
let submissionSequence = 0;

function createTestApp(mapper: DentalVisionMapper = new MockDentalVisionMapper()) {
  const turnstileVerifier = vi.fn(async () => ({
    success: true as const,
    hostname: 'localhost',
    action: 'dental_quote',
  }));
  return {
    app: createWorkerApp({
      mapperFactory: () => mapper,
      turnstileVerifier,
      now: () => fixedNow,
    }),
    turnstileVerifier,
  };
}

async function submit(
  app: ReturnType<typeof createTestApp>['app'],
  storageConsent: boolean,
  idempotencyKey = crypto.randomUUID(),
  contactSuffix?: string,
  formOverrides: Record<string, string> = {},
  includeImage = true,
  omittedFields: readonly string[] = [],
) {
  submissionSequence += 1;
  const suffix = contactSuffix ?? String(submissionSequence).padStart(3, '0');
  const form = leadForm(storageConsent, {
    phone: `+999 000 0000${suffix}`,
    email: `mario.rossi+${suffix}@example.com`,
    ...formOverrides,
  });
  if (!includeImage) form.delete('image');
  for (const field of omittedFields) form.delete(field);
  return app.request(
    'http://worker.test/api/leads',
    {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'Idempotency-Key': idempotencyKey,
        'X-Staging-Key': STAGING_KEY,
        'X-Turnstile-Token': 'valid-test-token',
        'CF-Connecting-IP': `203.0.113.${(submissionSequence % 200) + 1}`,
      },
      body: form,
    },
    env,
    createExecutionContext(),
  );
}

describe('Cloudflare Worker lead lifecycle', () => {
  beforeEach(async () => {
    await env.LEADS_DB.prepare('DELETE FROM audit_events').run();
    await env.LEADS_DB.prepare('DELETE FROM leads').run();
    const listed = await env.RADIOGRAPHS.list();
    if (listed.objects.length > 0) {
      await env.RADIOGRAPHS.delete(listed.objects.map((object) => object.key));
    }
  });

  it('reports healthy only with valid config, D1 schema, and the R2 binding available', async () => {
    const { app } = createTestApp();
    const response = await app.request('http://worker.test/health', undefined, env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok', service: 'quotengine-api' });
  });

  it('stores a sanitized radiograph and returns the indicative estimate immediately', async () => {
    const { app, turnstileVerifier } = createTestApp();
    const response = await submit(app, true);
    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(turnstileVerifier).toHaveBeenCalledOnce();

    const body = await response.json<{
      lead: { id: string; status: string };
      leadAccessToken: string;
      outcome: string;
      result: { quote: object; requiresInPersonConfirmation: boolean } | null;
    }>();
    expect(body.lead.status).toBe('estimate_ready');
    expect(body.outcome).toBe('estimate_ready');
    expect(body.result?.quote).toBeTruthy();
    expect(body.result?.requiresInPersonConfirmation).toBe(true);
    expect(body.result).not.toHaveProperty('requiresClinicalReview');

    const row = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();
    expect(row?.private_payload).not.toContain('Mario Rossi');
    expect(row?.private_payload).not.toContain('@example.com');
    expect(row?.private_payload).not.toContain('+999 000');
    expect(row?.consent_text_sha256).toBe(
      '0000000000000000000000000000000000000000000000000000000000000001',
    );
    expect(row?.image_key).toBeTruthy();
    const radiograph = await env.RADIOGRAPHS.get(row!.image_key!);
    expect(radiograph?.customMetadata?.['consentVersion']).toBe('draft-2026-07-13');
    expect(await radiograph!.text()).not.toContain('Patient Name');

    const status = await app.request(
      `http://worker.test/api/leads/${body.lead.id}/status`,
      { headers: { Authorization: `Bearer ${body.leadAccessToken}` } },
      env,
    );
    const statusBody = await status.json<{ result: { quote: object } | null }>();
    expect(statusBody.result?.quote).toBeTruthy();

    const admin = await app.request(
      `http://worker.test/api/admin/leads/${body.lead.id}`,
      { headers: { Authorization: `Bearer ${ADMIN_KEY}` } },
      env,
    );
    const adminBody = await admin.json<{
      lead: {
        phone: string;
        email: string;
        contactPreference: string;
        attribution: { source?: string; campaign?: string };
        intent: { treatmentGoal: string; targetArea: string };
      };
    }>();
    expect(adminBody.lead).toEqual(expect.objectContaining({
      phone: expect.stringMatching(/^\+999 000 0000\d{3}$/),
      email: expect.stringMatching(/^mario\.rossi\+\d{3}@example\.com$/),
      contactPreference: 'whatsapp',
      intent: { treatmentGoal: 'replace_few_teeth', targetArea: 'upper' },
      attribution: expect.objectContaining({ source: 'google', campaign: 'implant-consultation-demo' }),
    }));

    const removedReviewRoute = await app.request(
      `http://worker.test/api/admin/leads/${body.lead.id}/approve`,
      { method: 'POST', headers: { Authorization: `Bearer ${ADMIN_KEY}` } },
      env,
    );
    expect(removedReviewRoute.status).toBe(404);

    const deleted = await app.request(
      `http://worker.test/api/leads/${body.lead.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${body.leadAccessToken}` },
      },
      env,
    );
    expect(deleted.status).toBe(204);
    expect(await env.LEADS_DB.prepare('SELECT id FROM leads WHERE id = ?').bind(body.lead.id).first()).toBeNull();
    expect(await env.RADIOGRAPHS.get(row!.image_key!)).toBeNull();
    const audit = await env.LEADS_DB.prepare(
      'SELECT lead_ref, event_type FROM audit_events WHERE lead_ref = ?',
    ).bind(row!.audit_ref).all<{ lead_ref: string; event_type: string }>();
    expect(row!.audit_ref).not.toBe(body.lead.id);
    expect(audit.results.map((event) => event.event_type)).toEqual(
      expect.arrayContaining(['admin_read', 'lead_deleted']),
    );
  });

  it('processes the radiograph without storing it when optional storage consent is refused', async () => {
    const { app } = createTestApp();
    const response = await submit(app, false);
    const body = await response.json<{ lead: { id: string } }>();
    const row = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();

    expect(response.status).toBe(201);
    expect(row?.radiograph_storage_consent).toBe(0);
    expect(row?.image_key).toBeNull();
  });

  it('returns a two-arch synthetic demo range without invoking the vision mapper', async () => {
    const mapper = new MockDentalVisionMapper();
    const assess = vi.spyOn(mapper, 'assess');
    const { app } = createTestApp(mapper);
    const key = crypto.randomUUID();
    const response = await submit(app, false, key, '904', {
      treatmentGoal: 'fixed_full_arch',
      targetArea: 'both',
    }, false);
    const body = await response.json<{
      lead: { id: string; status: string };
      outcome: string;
      result: {
        resultBasis: string;
        targetArea: string;
        quote: unknown;
        commercialEstimate: {
          pricingStatus: string;
          archCount: number;
          unitRange: { low: number; high: number };
          totalRange: { low: number; high: number };
          terms: {
            basis: string;
            inclusions: string[];
            exclusions: string[];
            tax: { status: string };
            validity: { status: string };
          };
        };
      } | null;
    }>();

    expect(response.status).toBe(201);
    expect(body.lead.status).toBe('estimate_ready');
    expect(body.outcome).toBe('estimate_ready');
    expect(body.result).toEqual(expect.objectContaining({
      resultBasis: 'commercial_scenario',
      targetArea: 'both',
      quote: null,
      commercialEstimate: expect.objectContaining({
        pricingStatus: 'synthetic_demo_catalog',
        archCount: 2,
        unitRange: { low: 2_700, high: 4_000 },
        totalRange: { low: 5_400, high: 8_000 },
        terms: expect.objectContaining({
          basis: 'synthetic_demo_catalog_not_clinic_price',
          inclusions: expect.arrayContaining([expect.stringContaining('soluzione fissa standard')]),
          exclusions: expect.arrayContaining([expect.stringContaining('Sedazione')]),
          tax: expect.objectContaining({ status: 'not_confirmed' }),
          validity: expect.objectContaining({
            status: 'temporary_until_clinic_catalog_approval',
          }),
        }),
      }),
    }));
    expect(assess).not.toHaveBeenCalled();

    const row = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();
    expect(row).toEqual(expect.objectContaining({
      image_key: null,
      ai_model: 'not_used',
      prompt_version: 'not_used',
      tool_schema_version: 'not_used',
      kb_version: '2026-08-03.demo-v1',
    }));

    const replay = await submit(app, false, key, '904', {
      treatmentGoal: 'fixed_full_arch',
      targetArea: 'both',
    }, false);
    expect(replay.status).toBe(200);
    await expect(replay.json()).resolves.toEqual(body);
    expect(assess).not.toHaveBeenCalled();
  });

  it('ignores an attached invalid image when full-arch storage is refused', async () => {
    const mapper = new MockDentalVisionMapper();
    const assess = vi.spyOn(mapper, 'assess');
    const { app } = createTestApp(mapper);
    const key = crypto.randomUUID();
    const requestWithIgnoredImage = (contents: string) => {
      const form = leadForm(false, {
        treatmentGoal: 'fixed_full_arch',
        targetArea: 'upper',
        phone: '+999 000 0000908',
        email: 'mario.rossi+908@example.com',
      });
      form.set('image', new File([contents], 'invalid.png', { type: 'image/png' }));
      return app.request(
        'http://worker.test/api/leads',
        {
          method: 'POST',
          headers: {
            Origin: ORIGIN,
            'Idempotency-Key': key,
            'X-Staging-Key': STAGING_KEY,
            'X-Turnstile-Token': 'valid-test-token',
            'CF-Connecting-IP': '203.0.113.208',
          },
          body: form,
        },
        env,
        createExecutionContext(),
      );
    };
    const response = await requestWithIgnoredImage('not-a-radiograph');
    const body = await response.json<{
      lead: { id: string; hasStoredRadiograph: boolean };
      result: { targetArea: string; commercialEstimate: object };
    }>();
    const replay = await requestWithIgnoredImage('different-ignored-bytes');
    const replayBody = await replay.json<typeof body>();

    expect(response.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replayBody).toEqual(body);
    expect(body.lead.hasStoredRadiograph).toBe(false);
    expect(body.result.targetArea).toBe('upper');
    expect(body.result.commercialEstimate).toBeTruthy();
    expect(assess).not.toHaveBeenCalled();
  });

  it('requires an image before accepting storage consent', async () => {
    const { app } = createTestApp();
    const response = await submit(app, true, crypto.randomUUID(), '905', {
      treatmentGoal: 'fixed_full_arch',
      targetArea: 'upper',
    }, false);
    const body = await response.json<{ error: { code: string } }>();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('image_required_for_storage');
  });

  it('defaults omitted legacy intent fields without selecting the commercial branch', async () => {
    const mapper = new MockDentalVisionMapper();
    const assess = vi.spyOn(mapper, 'assess');
    const { app } = createTestApp(mapper);
    const response = await submit(
      app,
      false,
      crypto.randomUUID(),
      '906',
      {},
      true,
      ['treatmentGoal', 'targetArea'],
    );
    const body = await response.json<{ lead: { id: string }; result: { resultBasis: string } }>();
    const admin = await app.request(
      `http://worker.test/api/admin/leads/${body.lead.id}`,
      { headers: { Authorization: `Bearer ${ADMIN_KEY}` } },
      env,
    );
    const adminBody = await admin.json<{
      lead: { intent: { treatmentGoal: string; targetArea: string } };
    }>();

    expect(response.status).toBe(201);
    expect(body.result.resultBasis).toBe('vision_items');
    expect(adminBody.lead.intent).toEqual({ treatmentGoal: 'unsure', targetArea: 'both' });
    expect(assess).toHaveBeenCalledOnce();
  });

  it('deterministically removes model candidates outside the selected arch', async () => {
    const mapper: DentalVisionMapper = {
      async assess() {
        return {
          archFindings: [],
          candidateTreatments: [
            { itemId: 'crown-porcelain', quantity: 1, arch: 'upper', rationale: 'upper', needsConfirmation: true },
            { itemId: 'implant-standard', quantity: 1, arch: 'lower', rationale: 'lower', needsConfirmation: true },
          ],
          imageQuality: 'good',
          overallConfidence: 'high',
          requiresClinicalConfirmation: true,
        };
      },
    };
    const { app } = createTestApp(mapper);
    const response = await submit(app, false, crypto.randomUUID(), '907', {
      treatmentGoal: 'restore_teeth',
      targetArea: 'upper',
    });
    const body = await response.json<{
      result: {
        targetArea: string;
        quote: { lineItems: Array<{ label: string; quantity: number }> };
        priceRange: unknown;
      };
    }>();

    expect(response.status).toBe(201);
    expect(body.result.targetArea).toBe('upper');
    expect(body.result.quote.lineItems).toEqual([
      expect.objectContaining({ label: 'Corona in Ceramica', quantity: 1 }),
    ]);
    expect(body.result.priceRange).toBeNull();
  });

  it('keeps the lead when optional R2 persistence is unavailable', async () => {
    const put = vi.spyOn(env.RADIOGRAPHS, 'put').mockRejectedValueOnce(new Error('R2 unavailable'));
    const { app } = createTestApp();
    const response = await submit(app, true);
    const body = await response.json<{
      lead: { id: string; hasStoredRadiograph: boolean };
      leadAccessToken: string;
    }>();
    const row = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();

    expect(response.status).toBe(201);
    expect(body.lead.hasStoredRadiograph).toBe(false);
    expect(row?.radiograph_storage_consent).toBe(1);
    expect(row?.radiograph_storage_active).toBe(0);
    expect(row?.image_key).toBeNull();
    put.mockRestore();

    const withdrawn = await app.request(
      `http://worker.test/api/leads/${body.lead.id}/radiograph`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${body.leadAccessToken}` } },
      env,
    );
    const afterWithdrawal = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();
    expect(withdrawn.status).toBe(204);
    expect(afterWithdrawal?.radiograph_storage_withdrawn_at).toBe(fixedNow.toISOString());
    expect(await env.LEADS_DB.prepare(
      "SELECT event_type FROM audit_events WHERE lead_ref = ? AND event_type = 'radiograph_storage_withdrawn'",
    ).bind(afterWithdrawal!.audit_ref).first()).not.toBeNull();
  });

  it('returns the original lead and access token on an idempotent retry', async () => {
    const mapper = new MockDentalVisionMapper();
    const assess = vi.spyOn(mapper, 'assess');
    const { app, turnstileVerifier } = createTestApp(mapper);
    const key = crypto.randomUUID();
    const first = await submit(app, false, key, '901');
    const firstBody = await first.json<{
      lead: { id: string };
      leadAccessToken: string;
      outcome: string;
    }>();
    const replay = await submit(app, false, key, '901');
    const replayBody = await replay.json<typeof firstBody>();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replayBody).toEqual(firstBody);
    expect(turnstileVerifier).toHaveBeenCalledTimes(2);
    expect(assess).toHaveBeenCalledTimes(1);
    expect(await env.LEADS_DB.prepare('SELECT COUNT(*) AS count FROM leads')
      .first<{ count: number }>()).toEqual({ count: 1 });
  });

  it('rejects reuse of an idempotency key for different patient data', async () => {
    const mapper = new MockDentalVisionMapper();
    const assess = vi.spyOn(mapper, 'assess');
    const { app } = createTestApp(mapper);
    const key = crypto.randomUUID();

    const first = await submit(app, false, key, '902');
    const conflict = await submit(app, false, key, '903');
    const conflictBody = await conflict.json<{
      error: { code: string };
      leadAccessToken?: string;
    }>();

    expect(first.status).toBe(201);
    expect(conflict.status).toBe(409);
    expect(conflictBody).toEqual({
      error: {
        code: 'idempotency_conflict',
        message: 'Idempotency-Key was already used for a different submission',
      },
    });
    expect(conflictBody).not.toHaveProperty('leadAccessToken');
    expect(assess).toHaveBeenCalledTimes(1);
    expect(await env.LEADS_DB.prepare('SELECT COUNT(*) AS count FROM leads')
      .first<{ count: number }>()).toEqual({ count: 1 });
  });

  it('rate-limits phone and email with separate opaque keys', async () => {
    const limit = vi.spyOn(env.SUBMISSION_RATE_LIMITER, 'limit');
    const { app } = createTestApp();
    const response = await submit(app, false);

    expect(response.status).toBe(201);
    expect(limit).toHaveBeenCalledTimes(2);
    const keys = limit.mock.calls.map(([input]) => input.key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys.every((key) => !key.includes('mario') && !key.includes('+999'))).toBe(true);
    limit.mockRestore();
  });

  it('keeps the lead and requests follow-up when inference fails', async () => {
    const mapper: DentalVisionMapper = {
      async assess() {
        throw new Error('synthetic model outage');
      },
    };
    const { app } = createTestApp(mapper);
    const response = await submit(app, true);
    const body = await response.json<{
      lead: { id: string; status: string };
      outcome: string;
      result: unknown;
      leadAccessToken: string;
    }>();

    expect(response.status).toBe(201);
    expect(body.lead.status).toBe('processing_failed');
    expect(body.outcome).toBe('follow_up_required');
    expect(body.result).toBeNull();
    expect(body.leadAccessToken.length).toBeGreaterThan(20);
    expect(await env.LEADS_DB.prepare('SELECT status FROM leads WHERE id = ?')
      .bind(body.lead.id).first()).toEqual({ status: 'processing_failed' });
  });

  it('returns a safe consultation-only response instead of guessing on poor input', async () => {
    const mapper: DentalVisionMapper = {
      async assess() {
        return {
          archFindings: [
            { arch: 'upper' as const, confidence: 'low' as const, observation: 'RAW_FINDING_SENTINEL' },
          ],
          candidateTreatments: [],
          existingRestorations: [
            { type: 'other' as const, arch: 'upper' as const, count: 2, note: 'RAW_OTHER_SENTINEL' },
          ],
          imageQuality: 'poor',
          overallConfidence: 'low',
          requiresClinicalConfirmation: true,
        };
      },
    };
    const { app } = createTestApp(mapper);
    const response = await submit(app, false);
    const body = await response.json<{
      lead: { status: string };
      outcome: string;
      result: { consultationOnly: boolean; quote: unknown; priceRange: unknown } | null;
    }>();

    expect(response.status).toBe(201);
    expect(body.lead.status).toBe('estimate_ready');
    expect(body.outcome).toBe('estimate_ready');
    expect(body.result).toEqual(expect.objectContaining({
      consultationOnly: true,
      quote: null,
      priceRange: null,
    }));
    expect(JSON.stringify(body)).not.toMatch(/RAW_FINDING|RAW_OTHER|archFindings|assessment/);
  });

  it('validates the funnel contact and attribution fields before persistence', async () => {
    const { app } = createTestApp();
    const invalidFields = [
      { email: 'not-an-email' },
      { phone: '123' },
      { contactPreference: 'sms' },
      { treatmentGoal: 'invented_goal' },
      { targetArea: 'unsure' },
      { landingPath: 'https://attacker.example/path' },
      { landingPath: '//attacker.example/path' },
    ];

    for (const override of invalidFields) {
      const response = await app.request(
        'http://worker.test/api/leads',
        {
          method: 'POST',
          headers: {
            Origin: ORIGIN,
            'Idempotency-Key': crypto.randomUUID(),
            'X-Staging-Key': STAGING_KEY,
            'X-Turnstile-Token': 'valid-test-token',
          },
          body: leadForm(false, override),
        },
        env,
      );
      expect(response.status).toBe(422);
    }

    expect(await env.LEADS_DB.prepare('SELECT COUNT(*) AS count FROM leads')
      .first<{ count: number }>()).toEqual({ count: 0 });
  });

  it('rejects a disallowed browser origin before Turnstile or persistence', async () => {
    const { app, turnstileVerifier } = createTestApp();
    const response = await app.request(
      'http://worker.test/api/leads',
      {
        method: 'POST',
        headers: { Origin: 'https://attacker.example', 'X-Turnstile-Token': 'token' },
        body: leadForm(true),
      },
      env,
    );

    expect(response.status).toBe(403);
    expect(turnstileVerifier).not.toHaveBeenCalled();
  });

  it('protects the public staging endpoint before Turnstile and image processing', async () => {
    const { app, turnstileVerifier } = createTestApp();
    const response = await app.request(
      'http://worker.test/api/leads',
      {
        method: 'POST',
        headers: { Origin: ORIGIN, 'X-Turnstile-Token': 'token' },
        body: leadForm(true),
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(turnstileVerifier).not.toHaveBeenCalled();
  });

  it('requires explicit health-data consent', async () => {
    const { app } = createTestApp();
    const response = await app.request(
      'http://worker.test/api/leads',
      {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'Idempotency-Key': crypto.randomUUID(),
          'X-Staging-Key': STAGING_KEY,
          'X-Turnstile-Token': 'token',
        },
        body: leadForm(true, { healthDataConsent: 'false' }),
      },
      env,
    );
    expect(response.status).toBe(422);
  });

  it('rejects stale consent or privacy-copy hashes before persisting health data', async () => {
    const { app } = createTestApp();
    const response = await app.request(
      'http://worker.test/api/leads',
      {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'Idempotency-Key': crypto.randomUUID(),
          'X-Staging-Key': STAGING_KEY,
          'X-Turnstile-Token': 'token',
        },
        body: leadForm(true, { consentTextSha256: 'f'.repeat(64) }),
      },
      env,
    );
    expect(response.status).toBe(409);
    expect(await env.LEADS_DB.prepare('SELECT COUNT(*) AS count FROM leads').first<{ count: number }>())
      .toEqual({ count: 0 });
  });

  it('requires a retry-safe idempotency key before Turnstile or persistence', async () => {
    const { app, turnstileVerifier } = createTestApp();
    const response = await app.request(
      'http://worker.test/api/leads',
      {
        method: 'POST',
        headers: {
          Origin: ORIGIN,
          'X-Staging-Key': STAGING_KEY,
          'X-Turnstile-Token': 'token',
        },
        body: leadForm(false),
      },
      env,
    );

    expect(response.status).toBe(400);
    expect(turnstileVerifier).not.toHaveBeenCalled();
    expect(await env.LEADS_DB.prepare('SELECT COUNT(*) AS count FROM leads')
      .first<{ count: number }>()).toEqual({ count: 0 });
  });

  it('keeps the schema writable by the previous Worker during migration/deploy', async () => {
    const timestamp = fixedNow.toISOString();
    await env.LEADS_DB.prepare(
      `INSERT INTO leads (
        id, audit_ref, language, status, created_at, updated_at, expires_at,
        image_key, image_media_type, image_size,
        health_data_consent, radiograph_storage_consent, radiograph_storage_active,
        radiograph_storage_withdrawn_at,
        consent_version, consent_text_sha256, consent_captured_at,
        privacy_notice_url, privacy_notice_sha256,
        turnstile_hostname, deletion_token_hash, ai_model, private_payload
      ) VALUES (?, ?, 'it', 'received', ?, ?, ?, NULL, NULL, NULL, 1, 0, 0, NULL,
        ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      'legacy-rollout-lead',
      'legacy-rollout-audit',
      timestamp,
      timestamp,
      '2026-08-12T10:00:00.000Z',
      'legacy-consent',
      'a'.repeat(64),
      timestamp,
      'https://example.com/privacy',
      'b'.repeat(64),
      'example.com',
      'legacy-token-hash',
      'legacy-model',
      'legacy-ciphertext',
    ).run();
    await env.LEADS_DB.prepare(
      "UPDATE leads SET status = 'pending_clinical_review' WHERE id = ?",
    ).bind('legacy-rollout-lead').run();

    const row = await env.LEADS_DB.prepare(
      `SELECT status, pipeline_version, prompt_version, tool_schema_version, kb_version
       FROM leads WHERE id = ?`,
    ).bind('legacy-rollout-lead').first<Record<string, string>>();
    expect(row).toEqual({
      status: 'pending_clinical_review',
      pipeline_version: '1.x-legacy-or-unversioned',
      prompt_version: 'legacy-unknown',
      tool_schema_version: '1',
      kb_version: 'legacy-unknown',
    });
  });

  it('withdraws radiograph storage consent without deleting the quote request', async () => {
    const { app } = createTestApp();
    const response = await submit(app, true);
    const body = await response.json<{ lead: { id: string }; leadAccessToken: string }>();
    const before = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();

    const withdrawn = await app.request(
      `http://worker.test/api/leads/${body.lead.id}/radiograph`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${body.leadAccessToken}` } },
      env,
    );
    expect(withdrawn.status).toBe(204);

    const after = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();
    expect(after).toEqual(expect.objectContaining({
      radiograph_storage_consent: 1,
      radiograph_storage_active: 0,
      image_key: null,
    }));
    expect(after?.radiograph_storage_withdrawn_at).toBe(fixedNow.toISOString());
    expect(await env.RADIOGRAPHS.get(before!.image_key!)).toBeNull();
    expect(await env.LEADS_DB.prepare(
      "SELECT event_type FROM audit_events WHERE lead_ref = ? AND event_type = 'radiograph_storage_withdrawn'",
    ).bind(before!.audit_ref).first()).not.toBeNull();

    const status = await app.request(
      `http://worker.test/api/leads/${body.lead.id}/status`,
      { headers: { Authorization: `Bearer ${body.leadAccessToken}` } },
      env,
    );
    expect(status.status).toBe(200);
  });

  it('withholds and deletes expired health data at the request boundary', async () => {
    const { app } = createTestApp();
    const response = await submit(app, true);
    const body = await response.json<{ lead: { id: string }; leadAccessToken: string }>();
    const row = await env.LEADS_DB.prepare('SELECT * FROM leads WHERE id = ?')
      .bind(body.lead.id)
      .first<LeadRow>();
    await env.LEADS_DB.prepare('UPDATE leads SET expires_at = ? WHERE id = ?')
      .bind('2026-07-13T09:00:00.000Z', body.lead.id)
      .run();

    const status = await app.request(
      `http://worker.test/api/leads/${body.lead.id}/status`,
      { headers: { Authorization: `Bearer ${body.leadAccessToken}` } },
      env,
    );
    expect(status.status).toBe(404);
    expect(await env.LEADS_DB.prepare('SELECT id FROM leads WHERE id = ?').bind(body.lead.id).first())
      .toBeNull();
    expect(await env.RADIOGRAPHS.get(row!.image_key!)).toBeNull();
  });
});
