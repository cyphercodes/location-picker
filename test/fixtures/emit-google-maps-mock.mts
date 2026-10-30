// Bundles test/fixtures/google-maps-mock.ts into e2e/fixtures/google-maps-mock.js, the standalone script that the
// route table serves for https://maps.googleapis.com/maps/api/js and that pages load as
// /e2e/fixtures/google-maps-mock.js?mode=classic (CONTRACT §12.6). The output is committed;
// test/providers/google-mock.test.ts fails when it is out of date.
//   node test/fixtures/emit-google-maps-mock.mts           rewrite the file
//   node test/fixtures/emit-google-maps-mock.mts --check   exit 1 when it is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { format, resolveConfig } from 'prettier';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const GOOGLE_MOCK_SCRIPT = join(ROOT, 'e2e/fixtures/google-maps-mock.js');

const BANNER = `// GENERATED from test/fixtures/google-maps-mock.ts by test/fixtures/emit-google-maps-mock.mts. Do not edit.
/* oxlint-disable */
`;

export async function emitGoogleMapsMock(): Promise<string> {
  const result = await build({
    stdin: {
      contents:
        "import { runStandalone } from './google-maps-mock.ts';\nrunStandalone(globalThis);\n",
      resolveDir: join(ROOT, 'test/fixtures'),
      sourcefile: 'google-maps-mock.standalone.ts',
      loader: 'ts',
    },
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    logLevel: 'silent',
  });
  const code = BANNER + (result.outputFiles[0]?.text ?? '');
  return format(code, {
    ...(await resolveConfig(GOOGLE_MOCK_SCRIPT)),
    filepath: GOOGLE_MOCK_SCRIPT,
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await emitGoogleMapsMock();
  if (process.argv.includes('--check')) {
    if (readFileSync(GOOGLE_MOCK_SCRIPT, 'utf8') !== code) {
      console.error(
        'e2e/fixtures/google-maps-mock.js is out of date: run node test/fixtures/emit-google-maps-mock.mts',
      );
      process.exit(1);
    }
  } else writeFileSync(GOOGLE_MOCK_SCRIPT, code);
}
