/**
 * Local web demo: patient goal + panoramic + details → indicative dental result.
 *
 * This entrypoint intentionally renders only the shared patient projection. Raw
 * assessment findings remain available to internal tooling but cannot reach HTML.
 */
import * as http from 'node:http';
import { Hono } from 'hono';
import { dentalClinicKB } from '../clients/dental-clinic.js';
import type { IntakeImage, IntakeImageMediaType, Language } from '../domain/types.js';
import { getEnv } from '../env.js';
import { nodeAdapter } from '../http/nodeAdapter.js';
import { rateLimit } from '../http/rateLimit.js';
import { createLogger } from '../log.js';
import type { DentalVisionMapper } from './DentalVisionMapper.js';
import {
  buildDemoIntakeText,
  isDemoGoal,
  isDemoTargetArea,
  renderDemoForm,
  renderDemoResult,
} from './demoPage.js';
import { createDemoFullArchResult } from './commercialCatalog.js';
import { generateDentalQuote } from './generateDentalQuote.js';
import { toPatientDentalResult } from './patientResult.js';

const MAX_UPLOAD_BODY_BYTES = 10 * 1024 * 1024;

const env = getEnv();
const logger = createLogger(env.LOG_LEVEL);
const app = new Hono();

app.use(
  '*',
  rateLimit({ max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000 }),
);

function mediaTypeOf(type: string): IntakeImageMediaType {
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  return 'image/jpeg';
}

function isLanguage(value: unknown): value is Language {
  return value === 'it' || value === 'en' || value === 'sq';
}

async function selectMapper(apiKey: string | undefined): Promise<DentalVisionMapper> {
  if (apiKey) {
    const { ClaudeDentalVisionMapper } = await import('./ClaudeDentalVisionMapper.js');
    return new ClaudeDentalVisionMapper(apiKey);
  }
  const { MockDentalVisionMapper } = await import('./MockDentalVisionMapper.js');
  return new MockDentalVisionMapper();
}

app.get('/', (c) => c.html(renderDemoForm()));
app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/dental-quote', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['image'];
    const rawGoal = body['goal'];
    const rawTargetArea = body['targetArea'];
    const rawText = body['text'];
    const rawLanguage = body['lang'];
    if (
      !isDemoGoal(rawGoal) ||
      !isDemoTargetArea(rawTargetArea) ||
      !isLanguage(rawLanguage)
    ) {
      return c.html('<p>Compila obiettivo, area e lingua.</p><p><a href="/">← Riprova</a></p>', 422);
    }
    if (rawGoal === 'fixed_full_arch') {
      return c.html(renderDemoResult(
        toPatientDentalResult(
          createDemoFullArchResult(rawTargetArea, rawLanguage),
          rawTargetArea,
        ),
        rawLanguage,
      ));
    }
    if (!(file instanceof File)) {
      return c.html('<p>La radiografia è richiesta per questo percorso.</p><p><a href="/">← Riprova</a></p>', 422);
    }

    const details = typeof rawText === 'string' ? rawText : '';
    const images: IntakeImage[] = [
      {
        kind: 'panoramic_xray',
        mediaType: mediaTypeOf(file.type),
        data: Buffer.from(await file.arrayBuffer()).toString('base64'),
      },
    ];
    const mapper = await selectMapper(getEnv().ANTHROPIC_API_KEY);
    const result = await generateDentalQuote(
      dentalClinicKB,
      {
        clientId: 'dental-clinic',
        language: rawLanguage,
        freeText: buildDemoIntakeText(rawGoal, details, rawLanguage, rawTargetArea),
        images,
      },
      mapper,
      undefined,
      { targetArea: rawTargetArea },
    );
    return c.html(renderDemoResult(
      toPatientDentalResult(result, rawTargetArea),
      rawLanguage,
    ));
  } catch (error) {
    logger.error('dental-quote request failed', error);
    return c.html(
      '<p>Errore durante l’elaborazione della richiesta. Riprova più tardi.</p><p><a href="/">← Riprova</a></p>',
      422,
    );
  }
});

const server = http.createServer(
  nodeAdapter(app.fetch.bind(app), {
    maxBodyBytes: MAX_UPLOAD_BODY_BYTES,
    onError: (error) => logger.error('HTTP adapter error', error),
  }),
);

server.listen(env.PORT, () => {
  logger.info(`dental demo on http://localhost:${env.PORT}`);
});
