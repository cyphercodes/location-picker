// WP5-04: grep rules on the packed tarball's declaration files (LOCKED 10, CONTRACT §1.2/§2 type rules), plus the
// §1.1 rule that shared chunks carry no side effects: the defineLocationPicker() statement lives in entry files only.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packProject, placeholder, skipUnbuilt, type PackedProject } from './packed.js';

const isDts = (file: string): boolean => /\.d\.[cm]?ts$/.test(file);
/** Drops block comments (JSDoc @example blocks mention imports) and whole-line comments. */
const stripComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GOOGLE_DTS = ['dist/google.d.cts', 'dist/google.d.mts'];

describe.skipIf(skipUnbuilt)(
  'WP5-04: grep rules on the packed tarball (needs `npm run build`)',
  () => {
    let packed: PackedProject;
    let read: (file: string) => string;
    let dts: string[];
    const where = (pattern: RegExp, among: readonly string[] = dts): string[] =>
      among.filter((file) => pattern.test(read(file)));
    const whereInCode = (pattern: RegExp, among: readonly string[] = dts): string[] =>
      among.filter((file) => pattern.test(stripComments(read(file))));

    beforeAll(() => {
      packed = packProject('grep');
      read = (file) => readFileSync(join(packed.pkg, file), 'utf8');
      dts = packed.files.filter(isDts);
    }, 60_000);
    afterAll(() => packed?.dispose());

    it('reference types="google.maps" appears only, and always, in dist/google.d.{mts,cts}', () => {
      expect(where(/reference types=["']google\.maps["']/)).toEqual(GOOGLE_DTS);
    });

    it('no declaration file imports CSS', () => {
      expect(whereInCode(/(?:from\s*|import\s*\(?\s*|require\(\s*)["'][^"']+\.css["']/)).toEqual(
        [],
      );
    });

    it.each([
      ['.d.mts', '.mjs'],
      ['.d.cts', '.cjs'],
    ])('%s relative specifiers end in %s', (dtsExt, jsExt) => {
      const wrong = dts
        .filter((file) => file.endsWith(dtsExt))
        .flatMap((file) =>
          [
            ...stripComments(read(file)).matchAll(
              /(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']*)["']/g,
            ),
          ]
            .map((match) => match[1] ?? '')
            .filter((specifier) => !specifier.endsWith(jsExt))
            .map((specifier) => `${file}: ${specifier}`),
        );
      expect(wrong).toEqual([]);
    });

    it('the HTMLElementTagNameMap augmentation exists exactly once, in dist/globals.d.ts', (ctx) => {
      const files = whereInCode(/interface\s+HTMLElementTagNameMap\b/);
      if (files.length === 0 && placeholder('globals.d.ts')) ctx.skip(placeholder('globals.d.ts'));
      expect(files).toEqual(['dist/globals.d.ts']);
      const augmentations = stripComments(read('dist/globals.d.ts')).match(
        /interface\s+HTMLElementTagNameMap\b/g,
      );
      expect(augmentations).toHaveLength(1);
    });

    it('element and root declarations reference dist/globals.d.ts', () => {
      const entries = ['index', 'element'].flatMap((e) => [`dist/${e}.d.mts`, `dist/${e}.d.cts`]);
      expect(where(/<reference path="\.\/globals\.d\.ts" \/>/, entries)).toEqual(entries);
    });

    it('dist/global.d.ts has no google import or reference', () => {
      const global = read('dist/global.d.ts');
      expect(global).not.toMatch(/reference types=["']google/);
      expect(stripComments(global)).not.toMatch(/google\.maps/);
      expect(stripComments(global)).not.toMatch(
        /(?:from\s*|import\s*\(\s*)["'][^"']*google[^"']*["']/,
      );
    });

    it('the LocationPickerGoogleStatics augmentation appears only in dist/google.d.{mts,cts}', (ctx) => {
      const declaring = whereInCode(/interface\s+LocationPickerGoogleStatics\b/);
      const augmenting = declaring.filter((file) =>
        /declare\s+module\s/.test(stripComments(read(file))),
      );
      const pending = placeholder('./google') ?? placeholder('global.d.ts');
      if (augmenting.length === 0 && pending) ctx.skip(pending);
      expect(augmenting).toEqual(GOOGLE_DTS);
      expect(declaring.filter((file) => !GOOGLE_DTS.includes(file))).toEqual(['dist/global.d.ts']);
    });

    it('no shared chunk runs defineLocationPicker() or customElements.define() at top level', () => {
      const chunks = packed.files.filter((file) => /^dist\/_chunks\/.+\.[cm]js$/.test(file));
      expect(chunks.length).toBeGreaterThan(0);
      const topLevelDefine =
        /^(?:[\w$.]+\.)?(?:defineLocationPicker\$?\d*|customElements\.define)\(/m;
      expect(whereInCode(topLevelDefine, chunks)).toEqual([]);
    });
  },
);
