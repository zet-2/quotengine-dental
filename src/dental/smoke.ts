/**
 * Live smoke test for the dental vision flow. Requires ANTHROPIC_API_KEY.
 *
 *   npm run dental:smoke -- [--image <path>] [--text "..."] [--lang it|en|sq]
 *
 * The key is read from quotengine-dental/.env (loaded via `node --env-file` in the
 * package.json script). Entrypoint glue — not unit-tested.
 */
import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { dentalClinicKB } from '../clients/dental-clinic.js';
import { ClaudeDentalVisionMapper } from './ClaudeDentalVisionMapper.js';
import { generateDentalQuote } from './generateDentalQuote.js';
import type { IntakeImage, IntakeImageMediaType, Language } from '../domain/types.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function mediaTypeFor(path: string): IntakeImageMediaType {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function main(): Promise<void> {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (!key) {
    process.stderr.write(
      'Missing ANTHROPIC_API_KEY. Put it in quotengine-dental/.env (ANTHROPIC_API_KEY=sk-ant-...).\n',
    );
    process.exitCode = 1;
    return;
  }

  const imagePath = arg('--image');
  const text = arg('--text') ?? 'Mi mancano alcuni denti, vorrei un preventivo indicativo.';
  const lang = (arg('--lang') ?? 'it') as Language;

  const images: IntakeImage[] = imagePath
    ? [
        {
          kind: 'panoramic_xray',
          mediaType: mediaTypeFor(imagePath),
          data: readFileSync(imagePath).toString('base64'),
        },
      ]
    : [];

  out(`Mapper: Claude (LIVE, claude-sonnet-4-6) · lang=${lang} · image=${imagePath ?? '(none — text only)'}`);
  out(`Message: "${text}"\n`);

  const mapper = new ClaudeDentalVisionMapper(key);
  const result = await generateDentalQuote(
    dentalClinicKB,
    {
      clientId: 'dental-clinic',
      language: lang,
      freeText: text,
      ...(images.length > 0 ? { images } : {}),
    },
    mapper,
  );

  out('— ASSESSMENT —');
  out(
    `image quality: ${result.assessment.imageQuality} · confidence: ${result.assessment.overallConfidence} · requiresClinicalConfirmation: ${result.requiresClinicalConfirmation}`,
  );
  for (const f of result.assessment.archFindings) {
    out(`  finding [${f.arch}] (${f.confidence}): ${f.observation}`);
  }
  for (const r of result.assessment.existingRestorations ?? []) {
    out(`  existing: ${r.count}× ${r.type}${r.arch ? ` [${r.arch}]` : ''}${r.note ? ` — ${r.note}` : ''}`);
  }
  for (const t of result.assessment.candidateTreatments) {
    out(`  treatment: ${t.itemId} x${t.quantity}${t.arch ? ` [${t.arch}]` : ''} — ${t.rationale}`);
  }
  out('');

  if (result.consultationOnly) {
    out('— RESULT: consultation only (input too uncertain to price) —');
    out(result.disclaimer);
  } else {
    out('— INDICATIVE QUOTE —');
    out(result.text ?? '');
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `dental:smoke failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
