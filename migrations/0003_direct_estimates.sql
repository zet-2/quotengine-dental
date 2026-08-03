CREATE TABLE leads_v3 (
  id TEXT PRIMARY KEY,
  audit_ref TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('it', 'sq', 'en')),
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'pending_clinical_review',
      'approved',
      'rejected',
      'estimate_ready',
      'processing_failed'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  image_key TEXT UNIQUE,
  image_media_type TEXT,
  image_size INTEGER,
  health_data_consent INTEGER NOT NULL CHECK (health_data_consent = 1),
  radiograph_storage_consent INTEGER NOT NULL CHECK (
    radiograph_storage_consent IN (0, 1)
  ),
  radiograph_storage_active INTEGER NOT NULL CHECK (
    radiograph_storage_active IN (0, 1)
    AND radiograph_storage_active <= radiograph_storage_consent
  ),
  radiograph_storage_withdrawn_at TEXT,
  consent_version TEXT NOT NULL,
  consent_text_sha256 TEXT NOT NULL,
  consent_captured_at TEXT NOT NULL,
  privacy_notice_url TEXT NOT NULL,
  privacy_notice_sha256 TEXT NOT NULL,
  turnstile_hostname TEXT NOT NULL,
  deletion_token_hash TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  pipeline_version TEXT NOT NULL DEFAULT '1.x-legacy-or-unversioned',
  prompt_version TEXT NOT NULL DEFAULT 'legacy-unknown',
  tool_schema_version TEXT NOT NULL DEFAULT '1',
  kb_version TEXT NOT NULL DEFAULT 'legacy-unknown',
  private_payload TEXT NOT NULL,
  CHECK (
    (radiograph_storage_active = 1 AND image_key IS NOT NULL)
    OR (radiograph_storage_active = 0 AND image_key IS NULL)
  )
);

INSERT INTO leads_v3 (
  id, audit_ref, language, status, created_at, updated_at, expires_at,
  image_key, image_media_type, image_size,
  health_data_consent, radiograph_storage_consent, radiograph_storage_active,
  radiograph_storage_withdrawn_at, consent_version, consent_text_sha256,
  consent_captured_at, privacy_notice_url, privacy_notice_sha256,
  turnstile_hostname, deletion_token_hash, ai_model,
  pipeline_version, prompt_version, tool_schema_version, kb_version,
  private_payload
)
SELECT
  id,
  audit_ref,
  language,
  status,
  created_at,
  updated_at,
  expires_at,
  image_key,
  image_media_type,
  image_size,
  health_data_consent,
  radiograph_storage_consent,
  radiograph_storage_active,
  radiograph_storage_withdrawn_at,
  consent_version,
  consent_text_sha256,
  consent_captured_at,
  privacy_notice_url,
  privacy_notice_sha256,
  turnstile_hostname,
  deletion_token_hash,
  ai_model,
  '1.x-legacy-review-flow',
  'legacy-unknown',
  '1',
  'legacy-unknown',
  private_payload
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_v3 RENAME TO leads;

CREATE INDEX leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX leads_expires_at_idx ON leads (expires_at);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);
