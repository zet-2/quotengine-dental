# Security policy

## Supported versions

Only the latest commit on `main` is supported while Quotengine remains pre-production.

## Reporting a vulnerability

Do not open a public issue containing patient data, radiographs, credentials, exploit details or
private deployment information. Report the issue through
[GitHub Private Vulnerability Reporting](https://github.com/zet-2/quotengine-dental/security/advisories/new).
Include the affected commit, impact, reproduction steps and whether any live data may have been
exposed.

Until a dedicated security mailbox and response SLA are published, this repository must not claim
a formal coordinated-disclosure program.

## Secret and data handling

- Never commit `.env`, `.dev.vars`, API keys, Access assertions or encryption keys.
- Never attach real patient images to issues, CI artifacts or pull requests.
- Use synthetic or lawfully de-identified fixtures locally.
- Treat lead tokens and form `Idempotency-Key` UUIDs as credentials; do not put them in URLs,
  analytics or logs.
- Keep R2 private and access health data only through authenticated Worker routes.
- Coordinate key rotation with a data migration; replacing the AES key in place makes stored leads
  unreadable.

See [`docs/threat-model.md`](docs/threat-model.md) and
[`docs/privacy-go-live-checklist.md`](docs/privacy-go-live-checklist.md) for the current controls and
production blockers.
