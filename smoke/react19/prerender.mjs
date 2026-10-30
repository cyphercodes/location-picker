// Server-renders HydrateApp into dist/hydrate.html (the page src/hydrate.tsx hydrates). `import 'location-picker'`
// runs here in Node, which also proves the import is SSR-safe.
import { readFileSync, writeFileSync } from 'node:fs';

const { render } = await import('./dist-server/hydrate-server.js');
const file = 'dist/hydrate.html';
const html = readFileSync(file, 'utf8');
if (!html.includes('<!--ssr-outlet-->')) throw new Error(`${file} has no <!--ssr-outlet-->`);
writeFileSync(file, html.replace('<!--ssr-outlet-->', render()));
console.log(`prerendered ${file}`);
