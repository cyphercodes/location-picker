// Bundles consumer entries with esbuild for test/package/bundle.test.ts (WP5-05) and prints `{ name: code }` as JSON.
// It runs in plain Node because esbuild refuses to start inside the jsdom test environment.
//   node test/package/bundle.mjs <project dir> '<JSON { name: entry source }>'
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argv, stdout } from 'node:process';
import { build } from 'esbuild';

const [, , cwd = '', entries = '{}'] = argv;
const out = {};
for (const [name, source] of Object.entries(JSON.parse(entries))) {
  const entry = join(cwd, `${name}.mjs`);
  writeFileSync(entry, source);
  // oxlint-disable-next-line no-await-in-loop -- a handful of small sequential builds
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: cwd,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
  });
  out[name] = result.outputFiles[0]?.text ?? '';
}
stdout.write(JSON.stringify(out));
