import { createScheduledController, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../src/worker/index.js';

async function insertLead(
  id: string,
  options: { expiresAt: string; imageKey: string | null },
): Promise<void> {
  const createdAt = '2000-01-01T00:00:00.000Z';
  await env.LEADS_DB.prepare(
    `INSERT INTO leads (
      id, audit_ref, language, status, created_at, updated_at, expires_at,
      image_key, image_media_type, image_size,
      health_data_consent, radiograph_storage_consent, radiograph_storage_active,
      radiograph_storage_withdrawn_at,
      consent_version, consent_text_sha256, consent_captured_at,
      privacy_notice_url, privacy_notice_sha256,
      turnstile_hostname, deletion_token_hash, ai_model,
      pipeline_version, prompt_version, tool_schema_version, kb_version,
      private_payload
    ) VALUES (?, ?, 'it', 'received', ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL,
      'test', ?, ?, 'https://example.com/privacy', ?, 'localhost', ?, 'test-model',
      'test-pipeline', 'test-prompt', 'test-tool', 'test-kb', 'unused')`,
  ).bind(
    id,
    `audit-${id}`,
    createdAt,
    createdAt,
    options.expiresAt,
    options.imageKey,
    options.imageKey ? 'image/jpeg' : null,
    options.imageKey ? 4 : null,
    options.imageKey ? 1 : 0,
    options.imageKey ? 1 : 0,
    'a'.repeat(64),
    createdAt,
    'b'.repeat(64),
    'c'.repeat(64),
  ).run();
}

describe('scheduled retention maintenance', () => {
  beforeEach(async () => {
    await env.LEADS_DB.prepare('DELETE FROM audit_events').run();
    await env.LEADS_DB.prepare('DELETE FROM leads').run();
    const listed = await env.RADIOGRAPHS.list();
    if (listed.objects.length > 0) {
      await env.RADIOGRAPHS.delete(listed.objects.map((object) => object.key));
    }
  });

  it('purges expired data, reconciles interrupted jobs, and expires old audit metadata', async () => {
    const imageKey = 'radiographs/2000-01/expired.jpg';
    await env.RADIOGRAPHS.put(imageKey, new Uint8Array([1, 2, 3, 4]));
    await insertLead('expired', { expiresAt: '2001-01-01T00:00:00.000Z', imageKey });
    await insertLead('stale', { expiresAt: '2999-01-01T00:00:00.000Z', imageKey: null });
    await env.LEADS_DB.prepare(
      "INSERT INTO audit_events (id, lead_ref, event_type, actor, occurred_at) VALUES ('old', '-', 'admin_list', 'tester', '2000-01-01T00:00:00.000Z')",
    ).run();

    await worker.scheduled(createScheduledController(), env);

    expect(await env.LEADS_DB.prepare("SELECT id FROM leads WHERE id = 'expired'").first())
      .toBeNull();
    expect(await env.RADIOGRAPHS.get(imageKey)).toBeNull();
    expect(await env.LEADS_DB.prepare("SELECT status FROM leads WHERE id = 'stale'").first())
      .toEqual({ status: 'processing_failed' });
    expect(await env.LEADS_DB.prepare("SELECT id FROM audit_events WHERE id = 'old'").first())
      .toBeNull();
  });
});
