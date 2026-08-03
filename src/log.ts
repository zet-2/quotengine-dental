/**
 * Minimal LOG_LEVEL-aware logger. Writes single-line entries to stderr by
 * default; the sink is injectable for tests and alternative transports.
 * No console.log in production paths.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSink = (line: string) => void;

export interface Logger {
  readonly debug: (message: string, ...context: readonly unknown[]) => void;
  readonly info: (message: string, ...context: readonly unknown[]) => void;
  readonly warn: (message: string, ...context: readonly unknown[]) => void;
  readonly error: (message: string, ...context: readonly unknown[]) => void;
}

const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const stderrSink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

function serializeValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function createLogger(level: LogLevel, sink: LogSink = stderrSink): Logger {
  const threshold = LEVEL_ORDER[level];

  const emit = (entryLevel: LogLevel, message: string, context: readonly unknown[]): void => {
    if (LEVEL_ORDER[entryLevel] < threshold) return;
    const suffix = context.length > 0 ? ` ${context.map(serializeValue).join(' ')}` : '';
    sink(`[${new Date().toISOString()}] [${entryLevel}] ${message}${suffix}`);
  };

  return Object.freeze({
    debug: (message: string, ...context: readonly unknown[]) => emit('debug', message, context),
    info: (message: string, ...context: readonly unknown[]) => emit('info', message, context),
    warn: (message: string, ...context: readonly unknown[]) => emit('warn', message, context),
    error: (message: string, ...context: readonly unknown[]) => emit('error', message, context),
  });
}
