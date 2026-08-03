CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  language TEXT NOT NULL CHECK (language IN ('it', 'sq', 'en')),
  status TEXT NOT NULL CHECK (
    status IN (
      'received',
      'pending_clinical_review',
      'approved',
      'rejected',
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
  consent_version TEXT NOT NULL,
  consent_text_sha256 TEXT NOT NULL,
  consent_captured_at TEXT NOT NULL,
  privacy_notice_url TEXT NOT NULL,
  turnstile_hostname TEXT NOT NULL,
  deletion_token_hash TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  private_payload TEXT NOT NULL,
  CHECK (
    (radiograph_storage_consent = 1 AND image_key IS NOT NULL)
    OR (radiograph_storage_consent = 0 AND image_key IS NULL)
  )
);

CREATE INDEX leads_created_at_idx ON leads (created_at DESC);
CREATE INDEX leads_expires_at_idx ON leads (expires_at);
CREATE INDEX leads_status_idx ON leads (status, created_at DESC);
