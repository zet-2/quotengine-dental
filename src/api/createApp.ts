/**
 * Builds the quote HTTP app (routes only — no sockets), so route behavior
 * is testable via app.request(). Server entrypoints wire in the node
 * adapter, rate limiting, and env-derived config.
 */
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { listClientIds, type ClientRegistry } from '../clients/index.js';
import type { IntakeMapper } from '../intake/IntakeMapper.js';
import { createIntakeMapper } from '../env.js';
import { generateQuote, QuoteGenerationError } from './generateQuote.js';
import { createLogger, type Logger } from '../log.js';

export interface QuoteAppDeps {
  readonly clients: ClientRegistry;
  /** Defaults to env-based selection (Claude with API key, mock without). */
  readonly mapperFactory?: () => Promise<IntakeMapper>;
  /** Applied to every route, in order (e.g. rate limiting). */
  readonly middleware?: readonly MiddlewareHandler[];
  readonly logger?: Logger;
}

export function createQuoteApp(deps: QuoteAppDeps): Hono {
  const { clients } = deps;
  const mapperFactory = deps.mapperFactory ?? createIntakeMapper;
  const logger = deps.logger ?? createLogger('info');

  const app = new Hono();
  for (const middleware of deps.middleware ?? []) {
    app.use('*', middleware);
  }

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.post('/quote', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    if (typeof body !== 'object' || body === null) {
      return c.json({ error: 'Request body must be a JSON object' }, 400);
    }

    const { clientId } = body as Record<string, unknown>;
    if (typeof clientId !== 'string') {
      return c.json({ error: 'clientId is required' }, 400);
    }

    const kb = clients[clientId];
    if (!kb) {
      return c.json(
        { error: `Unknown clientId '${clientId}'. Available: ${listClientIds(clients).join(', ')}` },
        404,
      );
    }

    try {
      const mapper = await mapperFactory();
      const result = await generateQuote(kb, body, mapper);
      return c.json({ quote: result.quote, text: result.text, json: result.json });
    } catch (err) {
      if (err instanceof QuoteGenerationError) {
        logger.warn(`Quote rejected for client '${clientId}'`, err.message);
        return c.json({ error: err.message }, 422);
      }
      logger.error(`Unexpected error handling /quote for client '${clientId}'`, err);
      return c.json({ error: 'Internal server error' }, 500);
    }
  });

  return app;
}
