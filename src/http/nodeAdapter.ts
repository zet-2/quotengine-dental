/**
 * Minimal Node.js http → fetch-handler adapter shared by the core and
 * dental servers. Hardening lives at this boundary:
 * - request bodies are capped (413) before they can exhaust memory
 * - the remote socket address is stamped into a header, overwriting any
 *   client-supplied value, so rate limiting cannot be spoofed
 * - handler failures surface as a generic 500 (details go to onError)
 */
import * as http from 'node:http';
import { REMOTE_ADDR_HEADER } from './rateLimit.js';

export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024; // 1 MiB

export interface NodeAdapterOptions {
  readonly maxBodyBytes?: number;
  /** Receives internal errors for server-side logging. */
  readonly onError?: (error: unknown) => void;
}

type FetchHandler = (req: Request) => Response | Promise<Response>;

function sendJson(res: http.ServerResponse, status: number, body: object): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
  res.end(JSON.stringify(body));
}

export function nodeAdapter(
  fetchHandler: FetchHandler,
  options: NodeAdapterOptions = {},
): http.RequestListener {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const onError = options.onError ?? (() => {});

  return (req, res) => {
    const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
    const chunks: Buffer[] = [];
    let received = 0;
    let finished = false;

    const onData = (chunk: Buffer): void => {
      received += chunk.length;
      if (received > maxBodyBytes) {
        finished = true;
        req.off('data', onData);
        sendJson(res, 413, { error: 'Request body too large' });
        req.resume(); // drain remaining data without buffering
        return;
      }
      chunks.push(chunk);
    };

    req.on('data', onData);

    req.on('error', (err) => {
      if (finished) return;
      finished = true;
      onError(err);
      sendJson(res, 400, { error: 'Malformed request' });
    });

    req.on('end', () => {
      if (finished) return;
      finished = true;

      const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        headers[name] = Array.isArray(value) ? value.join(', ') : value;
      }
      // Stamp the real socket address; never trust the client's value.
      headers[REMOTE_ADDR_HEADER] = req.socket.remoteAddress ?? 'unknown';

      const request = new Request(url, {
        method: req.method ?? 'GET',
        headers,
        body: body?.length ? body : undefined,
      });

      Promise.resolve()
        .then(() => fetchHandler(request))
        .then((response: Response) => {
          res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
          return response.arrayBuffer();
        })
        .then((buf: ArrayBuffer) => res.end(Buffer.from(buf)))
        .catch((err: unknown) => {
          onError(err);
          sendJson(res, 500, { error: 'Internal server error' });
        });
    });
  };
}
