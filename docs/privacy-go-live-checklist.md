# Privacy and clinical go-live checklist

This is an engineering gate, not legal advice. The service processes radiographs and generates
personalized treatment signals; real-patient production remains **NO-GO** until the accountable
controller and qualified counsel close the items below.

## Decisions that code cannot make

- [ ] Identify the data controller: Quotengine, the clinic, or joint controllers.
- [ ] Document the clinic/platform roles and sign the required controller/processor or joint-
      controller agreement.
- [ ] Choose and document the Article 6 legal basis and Article 9 condition for each purpose.
- [ ] Publish an Article 13 notice with the controller identity, privacy contact, purposes, legal
      bases, recipients, countries, safeguards, retention, rights, complaint route, AI logic, and
      consequences.
- [ ] Sign/review Cloudflare and Anthropic DPAs, subprocessor lists, SCCs and the transfer impact
      assessment. EU-located R2/D1 does not keep the image inside the EU when it is sent to the
      direct Anthropic API.
- [ ] Decide whether Anthropic's standard API retention (up to 30 days, subject to its terms and
      exceptions) is acceptable. Obtain an approved Zero Data Retention organization before real
      radiographs if the risk assessment requires it.
- [ ] Complete a DPIA before launch and reassess after material model/data-flow changes.
- [ ] Obtain specialist advice on EU MDR / software-as-a-medical-device classification. Calling
      output “non-diagnostic” does not by itself determine the product's intended purpose.
- [ ] Define the transfer mechanism required by the deployment jurisdiction and, if applicable,
      appoint the required representative.
- [ ] Document data-subject request, consent withdrawal, breach response, access review, key
      rotation, backup, and deletion procedures.
- [ ] Define a restore procedure that replays deletion/suppression records before traffic resumes,
      so a D1 Time Travel restore cannot silently resurrect an erased lead.

Primary references: [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng),
[EDPB consent guidance](https://www.edpb.europa.eu/our-work-tools/our-documents/guidelines/guidelines-052020-consent-under-regulation-2016679_en),
[Anthropic API retention](https://privacy.anthropic.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data),
[Anthropic ZDR](https://privacy.anthropic.com/en/articles/8956058-i-have-a-zero-data-retention-agreement-with-anthropic-what-products-does-it-apply-to).

## Consent design expected by the API

The site must present separate, unchecked choices before upload:

1. **Required health-data processing consent.** Covers processing the radiograph and message,
   sending them to the named AI provider to prepare and immediately display an automatic,
   non-binding estimate, retaining the encrypted lead/result for the declared period, and allowing
   the clinic to follow up on the requested service.
2. **Optional original-radiograph storage consent.** Covers keeping the sanitized original in R2
   and making it available to the clinic during the declared period. Refusal must still allow the
   estimate flow; the Worker processes the image in memory and does not write it to R2.
3. **Optional marketing consent.** Not implemented by this repository. It must remain entirely
   separate if added later.

The server records its configured notice URL/hash, localized consent-copy hash, consent version,
timestamp, language, Turnstile hostname and each storage choice. It requires the browser to echo
the current version/hashes and rejects stale or altered copy. The lead token can withdraw only the
optional R2 storage while leaving the estimate request active.

For the patient-declared full-arch commercial scenario, the current implementation does not send
the image to Anthropic and accepts the submission without an image when storage consent is false.
If the patient optionally supplies one for later clinical follow-up, it is canonicalized and stored
only with the separate storage choice. The notice must describe provider disclosure as conditional
on the selected path and must not imply that optional R2 refusal prevents in-memory processing on
vision paths.

Draft Italian wording for counsel to review:

> Acconsento esplicitamente al trattamento della radiografia, dei miei dati di contatto e del mio
> messaggio, anche tramite il fornitore AI indicato nell'informativa, per ricevere subito una stima
> automatica, puramente indicativa e non diagnostica, e per essere ricontattato in merito alla mia
> richiesta. Ho letto l'informativa privacy e so che posso revocare il consenso.

Optional storage choice:

> Acconsento alla conservazione della radiografia originale sanificata e alla sua consultazione da
> parte della clinica per un massimo di 30 giorni. Posso rifiutare senza perdere la possibilità di
> ricevere la valutazione.

The notice must explain that “metadata sanitized” does not remove names or identifiers burned into
image pixels. The upload UI should ask patients to verify that the image does not visibly show name,
date of birth, patient number, or other identifiers.

## Direct-estimate product gate

- [x] A constrained patient-facing result is stored as `estimate_ready` and returned immediately.
- [x] Poor image quality or low confidence returns `consultationOnly` with no guessed price.
- [x] Provider/model failure preserves the contact as `processing_failed` for clinic follow-up.
- [x] The patient response never exposes the raw AI assessment, findings or rationales.
- [x] Every numerical result is labelled automatic, non-diagnostic, non-binding and requires
      in-person clinical confirmation.
- [x] Patient-declared full-arch intent uses a versioned synthetic demo scenario without
      vision inference; ordinary four-plus-fixture pricing remains blocked.
- [x] Production admin requests require a verified Cloudflare Access JWT in addition to the admin
      API key, and audit events use the named identity.
- [ ] Put admin routes behind Cloudflare Access with named identities and MFA.
- [ ] Define contact-response expectations and escalation when the AI returns `consultationOnly`
      or fails.
- [ ] Add a clinic-facing backoffice that does not expose R2 directly and records follow-up state.
- [ ] Validate on a substantially larger, locked, dentist-labelled set before promising accuracy;
      the current six-case fixture is not sufficient evidence.
- [ ] Obtain specialist sign-off on the intended-purpose implications of sending personalized
      estimates directly to patients without pre-delivery clinical review.
- [ ] Replace the synthetic full-arch demo catalog with the clinic's approved current
      price list, documenting gross/net status, VAT, included components, exclusions, validity,
      translations and one-versus-two-arch calculation.

## Technical controls implemented

- [x] Static Worker entrypoint; no Node filesystem/socket dependency.
- [x] Fail-closed production configuration and required secrets.
- [x] Server-side Turnstile hostname/action validation.
- [x] Exact CORS origin allowlist, a secret staging-only access gate, and Cloudflare-native source
      plus separate phone/email rate limiting.
- [x] Required idempotency key prevents retry-driven duplicate leads/provider charges, is bound to
      a normalized form/consent plus any processed-image fingerprint, and recovers the original
      lead token only on a match. Full-arch uploads refused for storage are ignored and not hashed.
- [x] One JPEG/PNG, 6 MiB maximum, magic-byte and dimension checks.
- [x] Image decode and canonical JPEG re-encode through the Cloudflare Images binding.
- [x] Random R2 keys with no original filename or contact data.
- [x] AES-256-GCM encryption of contact, attribution, message, AI assessment and estimate in D1.
- [x] Patient/admin authenticated status, granular storage withdrawal, active-record deletion, and
      a separate metadata-only access/deletion audit.
- [x] Hourly bounded expiry/reconciliation cron plus R2 lifecycle backstop.
- [x] Workers-runtime integration tests and Wrangler dry-run in CI.
- [ ] Create deployment-specific staging/production D1 and R2 resources with EU jurisdiction.
- [ ] Configure and verify 30-day R2 lifecycle rules in the deployment account.
- [x] Optional R2 failure preserves the lead and records storage as inactive.
- [ ] Create domain-restricted Turnstile widgets and validate real Siteverify responses.
- [ ] Create the Cloudflare Access/MFA application and validate the configured issuer/audience;
      configure WAF/rate-limit monitoring and alerting.
- [ ] Confirm Anthropic ZDR/retention and contractual controls in the actual API organization.
- [ ] Run restore, deletion, key-recovery, incident, and direct-estimate failure drills.
- [ ] Measure real vision-request latency, approve Workers-log retention/access, and decide whether
      inline idempotent processing should move to a durable background job.

Application erasure removes active D1/R2 data, but resilience copies have provider-controlled
windows: D1 Time Travel retains restore points for 7 days on Free and 30 days on paid plans, while
R2 lifecycle expiry can be asynchronous. The published retention/erasure language and internal
procedure must describe those residual periods accurately.

## Repository image gate

This public snapshot contains only the six CC BY case-report fixtures documented in
`THIRD_PARTY_NOTICES.md`. Do not add patient images or differently licensed assets without
documented provenance, de-identification, lawful basis/consent and redistribution rights.
