/**
 * Fixed-window in-memory rate limiter middleware for Hono.
 * Keys requests by the remote-address header that nodeAdapter stamps from
 * the socket (client-supplied values are overwritten there, so it cannot
 * be spoofed). Suitable for a single-process deployment; put a shared
 * limiter (reverse proxy, Redis) in front for multi-instance setups.
 */
import type { MiddlewareHandler } from 'hono';

/** Header carrying the socket remote address; stamped by nodeAdapter. */
export const REMOTE_ADDR_HEADER = 'x-quotengine-remote-addr';

/** Cap on tracked client entries before expired windows are swept. */
const MAX_TRACKED_CLIENTS = 10_000;

export interface RateLimitOptions {
  /** Maximum requests allowed per window per client. */
  readonly max: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Clock override for tests. */
  readonly now?: () => number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

export function rateLimit(options: RateLimitOptions): MiddlewareHandler {
  const { max, windowMs } = options;
  const now = options.now ?? Date.now;
  // Encapsulated mutable state: a limiter is a counter by nature.
  const windows = new Map<string, WindowState>();

  const sweepExpired = (timestamp: number): void => {
    for (const [key, state] of windows) {
      if (timestamp - state.windowStart >= windowMs) windows.delete(key);
    }
  };

  return async (c, next) => {
    const key = c.req.header(REMOTE_ADDR_HEADER) ?? 'unknown';
    const timestamp = now();

    if (windows.size > MAX_TRACKED_CLIENTS) sweepExpired(timestamp);

    const state = windows.get(key);
    if (!state || timestamp - state.windowStart >= windowMs) {
      windows.set(key, { count: 1, windowStart: timestamp });
      return next();
    }

    if (state.count >= max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((state.windowStart + windowMs - timestamp) / 1000),
      );
      c.header('Retry-After', String(retryAfterSeconds));
      return c.json({ error: 'Too many requests, retry later' }, 429);
    }

    state.count += 1;
    return next();
  };
}
