/**
 * CLI for the dental eval harness:
 *   npm run eval:dental -- --cases <dir> --min-cases 20 --strict --output report.json
 *
 * Loads case JSON files (default: ./eval/cases), base64-encodes any referenced
 * images, runs them through the vision mapper (Claude if ANTHROPIC_API_KEY is set,
 * otherwise the offline Mock = pipeline smoke check only), then prints production-policy coverage,
 * explicitly coarse agreement, and optional item/price metrics after the production sanitizer.
 *
 * This is CLI glue (file IO); the scoring logic it calls is unit-tested.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { dentalClinicKB } from '../clients/dental-clinic.js';
import { MockDentalVisionMapper } from '../dental/MockDentalVisionMapper.js';
import type { DentalVisionMapper } from '../dental/DentalVisionMapper.js';
import type { IntakeImage } from '../domain/types.js';
import type { EvalCase } from './types.js';
import { runEval } from './runEval.js';
import { itemLabelsMatchCoarseLabels } from './classify.js';
import { implantCountRange } from '../dental/implantRange.js';
import {
  DENTAL_KB_VERSION,
  DENTAL_PIPELINE_VERSION,
  DENTAL_PROMPT_VERSION,
  DENTAL_TOOL_SCHEMA_VERSION,
} from '../dental/modelMetadata.js';
import { parseEvalCliOptions } from './cliOptions.js';

const ExpectedTotalRangeSchema = z
  .object({
    low: z.number().finite().nonnegative(),
    high: z.number().finite().nonnegative(),
  })
  .refine((range) => range.low <= range.high, {
    message: 'expectedTotalRange.low must be <= expectedTotalRange.high',
  });

const ItemQuantitiesSchema = z
  .record(z.string().min(1), z.number().int().positive())
  .refine((quantities) => Object.keys(quantities).length > 0, {
    message: 'itemQuantities must contain at least one item',
  });

const CaseFileSchema = z.object({
  name: z.string().min(1),
  intake: z.object({
    freeText: z.string().min(1),
    language: z.enum(['it', 'sq', 'en']),
    images: z
      .array(
        z.object({
          kind: z.enum(['photo', 'panoramic_xray', 'document']),
          mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
          path: z.string().min(1),
        }),
      )
      .optional(),
  }),
  expected: z.object({
    treatmentCategories: z.array(z.string()),
    implantCount: z.number().int().nonnegative(),
    itemQuantities: ItemQuantitiesSchema.optional(),
    expectedTotalRange: ExpectedTotalRangeSchema.optional(),
  }),
  source: z.string().min(1),
  notes: z.string().optional(),
});

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

interface LoadedCases {
  readonly runnable: readonly EvalCase[];
  readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/** Load case files. Cases referencing an image that isn't on disk yet are skipped (not fatal). */
function loadCases(dir: string): LoadedCases {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const runnable: EvalCase[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
    const parsed = CaseFileSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ name: file, reason: `invalid case file: ${parsed.error.message}` });
      continue;
    }

    const knownItemIds = new Set(dentalClinicKB.items.map((item) => item.id));
    const unknownExpectedItemIds = Object.keys(parsed.data.expected.itemQuantities ?? {}).filter(
      (itemId) => !knownItemIds.has(itemId),
    );
    if (unknownExpectedItemIds.length > 0) {
      skipped.push({
        name: parsed.data.name,
        reason: `unknown expected item ID(s): ${unknownExpectedItemIds.join(', ')}`,
      });
      continue;
    }
    if (!itemLabelsMatchCoarseLabels(parsed.data.expected, dentalClinicKB)) {
      skipped.push({
        name: parsed.data.name,
        reason:
          'itemQuantities contradict treatmentCategories and/or implantCount coarse labels',
      });
      continue;
    }

    const imageSpecs = parsed.data.intake.images ?? [];
    const missing = imageSpecs.filter((img) => !existsSync(join(dir, img.path)));
    if (missing.length > 0) {
      skipped.push({
        name: parsed.data.name,
        reason: `awaiting image(s): ${missing.map((m) => m.path).join(', ')}`,
      });
      continue;
    }

    const images: IntakeImage[] = imageSpecs.map((img) => ({
      kind: img.kind,
      mediaType: img.mediaType,
      data: readFileSync(join(dir, img.path)).toString('base64'),
    }));

    runnable.push({
      name: parsed.data.name,
      intake: {
        freeText: parsed.data.intake.freeText,
        language: parsed.data.intake.language,
        ...(images.length > 0 ? { images } : {}),
      },
      expected: parsed.data.expected,
      source: parsed.data.source,
      ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
    });
  }

  return { runnable, skipped };
}

async function selectMapper(): Promise<{
  mapper: DentalVisionMapper;
  live: boolean;
  model: string;
}> {
  const key = process.env['ANTHROPIC_API_KEY'];
  if (key) {
    const { ClaudeDentalVisionMapper } = await import('../dental/ClaudeDentalVisionMapper.js');
    const model = process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6';
    return { mapper: new ClaudeDentalVisionMapper(key, model), live: true, model };
  }
  return { mapper: new MockDentalVisionMapper(), live: false, model: 'mock-deterministic' };
}

async function main(): Promise<void> {
  const options = parseEvalCliOptions(process.argv.slice(2));
  const { runnable, skipped } = loadCases(options.casesDir);

  if (options.strict && skipped.length > 0) {
    throw new Error(`Strict eval rejected ${skipped.length} skipped/invalid case(s)`);
  }
  if (runnable.length < options.minCases) {
    throw new Error(
      `Eval requires at least ${options.minCases} runnable case(s); found ${runnable.length}`,
    );
  }

  const { mapper, live, model } = await selectMapper();

  out(
    `Dental eval — ${runnable.length} runnable, ${skipped.length} skipped — ` +
      `from ${options.casesDir}`,
  );
  out(
    `Mapper: ${live ? 'Claude (LIVE)' : 'MOCK (offline — pipeline smoke check only, not an accuracy measurement)'}`,
  );
  for (const s of skipped) out(`  ⤬ ${s.name}: ${s.reason}`);
  out('');

  const report = await runEval(runnable, mapper, dentalClinicKB);

  if (options.outputPath) {
    const persisted = {
      schemaVersion: 3,
      generatedAt: new Date().toISOString(),
      mode: live ? 'live' : 'mock',
      model,
      versions: {
        pipeline: DENTAL_PIPELINE_VERSION,
        prompt: DENTAL_PROMPT_VERSION,
        toolSchema: DENTAL_TOOL_SCHEMA_VERSION,
        knowledgeBase: DENTAL_KB_VERSION,
      },
      casesDir: options.casesDir,
      skipped,
      report,
    };
    mkdirSync(dirname(options.outputPath), { recursive: true });
    writeFileSync(options.outputPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
    out(`Machine-readable report: ${options.outputPath}`);
  }

  for (const c of report.cases) {
    const hasDetailedMismatch =
      c.itemQuantitiesExactMatch === false || c.patientTotalRangeOverlap === false;
    const hasAllDetailedLabels =
      c.itemQuantitiesExactMatch !== null && c.patientTotalRangeOverlap !== null;
    const fullDetailedMatch =
      c.coarseOutcomeMatch &&
      c.itemQuantitiesExactMatch === true &&
      c.patientTotalRangeOverlap === true;
    const marker = c.error
      ? '!'
      : c.abstained
        ? '○'
        : fullDetailedMatch
          ? '✓'
          : c.coarseOutcomeMatch && !hasDetailedMismatch
            ? '≈'
            : '✗';
    const detail = c.error
      ? ` (error: ${c.error})`
      : c.abstained
        ? ' (production safety gate: consultation-only)'
        : c.coarseOutcomeMatch && hasDetailedMismatch
          ? ' (coarse match; detailed mismatch)'
          : c.coarseOutcomeMatch && !hasAllDetailedLabels
            ? ' (coarse only; detailed labels unavailable)'
            : '';
    out(`${marker} ${c.name}${detail}`);
    if (!c.error) {
      const r = implantCountRange(c.predicted.implantCount);
      out(`    predicted: [${c.predicted.treatmentCategories.join(', ')}] implants≈${c.predicted.implantCount} (range ${r.low}-${r.high})`);
      out(`    expected:  [${c.expected.treatmentCategories.join(', ')}] implants=${c.expected.implantCount}`);
      const predictedItems = Object.entries(c.predicted.itemQuantities)
        .map(([itemId, quantity]) => `${itemId}×${quantity}`)
        .join(', ');
      out(`    predicted items: ${predictedItems || 'none'}`);
      if (c.predicted.patientFacingTotalRange) {
        out(
          `    patient total: ${dentalClinicKB.currency} ` +
            `${c.predicted.patientFacingTotalRange.low}-${c.predicted.patientFacingTotalRange.high}`,
        );
      }
    }
  }

  out('');
  out(
    `Coverage: ${report.coveragePct}% (${report.answered}/${report.total} numerical; ` +
      `${report.abstained} abstained; ${report.errors} errors)`,
  );
  out(
    `Coarse selective agreement: ${report.coarseSelectiveAgreementPct}%  ` +
      `(overall ${report.coarseOverallAgreementPct}% · category exact-match ` +
      `${report.coarseCategoriesSelectiveExactAgreementPct}% · implant-in-range ` +
      `${report.coarseImplantCountSelectiveInRangePct}%)`,
  );
  out(
    `Detailed label coverage: items ${report.itemLabelCoveragePct}% ` +
      `(${report.itemLabels}/${report.total}) · patient-total ranges ` +
      `${report.priceRangeLabelCoveragePct}% (${report.priceRangeLabels}/${report.total})`,
  );
  out(
    report.itemLabels === 0
      ? 'Item/quantity exact agreement: n/a (0 labelled cases)'
      : `Item/quantity exact agreement: ${report.itemQuantitiesOverallExactAgreementPct}% overall; ` +
          `${report.itemQuantitiesSelectiveExactAgreementPct}% selective ` +
          `(${report.answeredWithItemLabels} answered labelled cases)`,
  );
  out(
    report.priceRangeLabels === 0
      ? 'Patient-total range overlap: n/a (0 labelled cases)'
      : `Patient-total range overlap: ${report.patientTotalRangeOverallOverlapPct}% overall; ` +
          `${report.patientTotalRangeSelectiveOverlapPct}% selective ` +
          `(${report.answeredWithPriceRangeLabels} answered labelled cases)`,
  );
  if (!live) {
    out(
      'Note: set ANTHROPIC_API_KEY to run the live mapper; only governed, ' +
        'correctly labelled cases can measure accuracy.',
    );
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `eval:dental failed: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exitCode = 1;
});
