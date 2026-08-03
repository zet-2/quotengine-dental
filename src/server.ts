/**
 * HTTP server entrypoint: POST /quote, GET /health.
 * Composition only — routes live in api/createApp.ts, transport hardening
 * (body cap, remote-address stamping) in http/nodeAdapter.ts.
 */
import * as http from 'node:http';
import { loadClients } from './clients/index.js';
import { createQuoteApp } from './api/createApp.js';
import { nodeAdapter } from './http/nodeAdapter.js';
import { rateLimit } from './http/rateLimit.js';
import { createLogger } from './log.js';
import { getEnv } from './env.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const env = getEnv();
const logger = createLogger(env.LOG_LEVEL);
const clients = await loadClients();

const app = createQuoteApp({
  clients,
  logger,
  middleware: [
    rateLimit({ max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_SECONDS * 1000 }),
  ],
});

const server = http.createServer(
  nodeAdapter(app.fetch.bind(app), {
    onError: (err) => logger.error('HTTP adapter error', err),
  }),
);

server.listen(env.PORT, () => {
  logger.info(`quotengine server listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
