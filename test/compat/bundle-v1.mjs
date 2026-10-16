// Bundles a v1 consumer entry for test/compat/v1-package.test.ts (WP1-04) and prints `{ version, code }` as JSON.
// It runs in plain Node because esbuild refuses to start inside the jsdom test environment.
//   node test/compat/bundle-v1.mjs <esbuild|rolldown> <entry> <project dir>
import { argv, stdout } from 'node:process';

const [, , bundler, entry, cwd] = argv;

if (bundler === 'esbuild') {
  const { build, version } = await import('esbuild');
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: cwd,
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    logLevel: 'silent',
  });
  stdout.write(JSON.stringify({ version, code: result.outputFiles[0].text }));
} else if (bundler === 'rolldown') {
  const { rolldown, VERSION } = await import('rolldown');
  const bundle = await rolldown({ input: entry, cwd, platform: 'browser', logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'iife' });
  await bundle.close();
  stdout.write(JSON.stringify({ version: VERSION, code: output[0].code }));
} else {
  throw new Error(`unknown bundler: ${bundler}`);
}
