// Static server for the built smoke apps, plus the form POST echo every app submits to (WP5-12). No dependencies.
//   node serve.mjs <root>     (PORT from the environment, default 4300; listens on 127.0.0.1)
// POST /echo answers {"method": "POST", "fields": {...}} for an application/x-www-form-urlencoded body.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.env.PORT ?? 4300);

createServer((request, response) => {
  handle(request, response).catch((error) => {
    console.error(error);
    response.writeHead(500).end();
  });
}).listen(port, '127.0.0.1', () =>
  console.log(`smoke server: ${root} on http://127.0.0.1:${port}/`),
);

async function handle(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'POST' && url.pathname === '/echo') {
    const fields = Object.fromEntries(new URLSearchParams(await body(request)));
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ method: 'POST', fields }));
    return;
  }
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    await stat(file);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' }).end(`not found: ${url.pathname}`);
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}

function body(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}
