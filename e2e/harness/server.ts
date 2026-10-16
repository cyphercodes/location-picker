// Static file server for e2e pages: serves the repository root (so /dist/, /e2e/fixtures/ and /node_modules/ are all
// reachable) on 127.0.0.1 only. Started by global-setup.ts on LP_PORT.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export const HOST = '127.0.0.1';

/** The port every local e2e server derives from (default 4173); set LP_PORT to run several suites side by side. */
export function lpPort(): number {
  return Number(process.env.LP_PORT ?? 4173);
}

export function startStaticServer(root: string, port: number): Promise<Server> {
  const server = createServer((request, response) => {
    serve(root, request, response).catch(() => response.writeHead(500).end());
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve(server));
  });
}

async function serve(
  root: string,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${HOST}`).pathname);
  let file = normalize(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${pathname}`);
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}
