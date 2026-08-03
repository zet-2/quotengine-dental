/**
 * Tests for the LOG_LEVEL-aware logger.
 */
import { describe, it, expect, vi } from 'vitest';
import { createLogger, type LogSink } from '../src/log.js';

function makeSink(): { sink: LogSink; lines: string[] } {
  const lines: string[] = [];
  return { sink: (line) => lines.push(line), lines };
}

describe('createLogger', () => {
  it('emits messages at or above the configured level', () => {
    const { sink, lines } = makeSink();
    const log = createLogger('warn', sink);

    log.debug('too quiet');
    log.info('still too quiet');
    log.warn('heard');
    log.error('also heard');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/\[warn\] heard/);
    expect(lines[1]).toMatch(/\[error\] also heard/);
  });

  it('emits everything at debug level with ISO timestamps', () => {
    const { sink, lines } = makeSink();
    const log = createLogger('debug', sink);

    log.debug('a');
    log.info('b');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] \[debug\] a$/);
  });

  it('serializes extra context values', () => {
    const { sink, lines } = makeSink();
    const log = createLogger('info', sink);

    log.error('failed', { code: 42 }, new Error('boom'));

    expect(lines[0]).toContain('failed');
    expect(lines[0]).toContain('"code":42');
    expect(lines[0]).toContain('boom');
  });

  it('defaults to a stderr sink without throwing', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const log = createLogger('info');
      log.info('to stderr');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0]?.[0])).toContain('to stderr');
    } finally {
      spy.mockRestore();
    }
  });
});
