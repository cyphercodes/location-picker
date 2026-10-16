// The frozen v1 file as bytes: ES5 only, UMD branch order, size, sha lock, and sync with its source (AMENDMENTS A1).
// CI runs the unit project before `npm run build`, so these read the committed artifact, which the build copies to
// dist/ byte-for-byte; the dist copy is checked too whenever it exists (and by scripts/pack-check.mjs after the build).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import { brotliCompressSync } from 'node:zlib';
import { parse, tokenizer, tokTypes, type Token } from 'acorn';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTIFACT_PATH, DIST_PATH, LOCK_PATH, artifact } from './v1-harness.js';

const copies = [ARTIFACT_PATH, ...(existsSync(DIST_PATH) ? [DIST_PATH] : [])];

afterEach(() => {
  document.head.replaceChildren();
});

/** acorn's Token typings omit `value` (the identifier name or literal value). */
function tokenValue(token: Token | undefined): unknown {
  return token && Reflect.get(token, 'value');
}

describe.each(copies)('%s', (path) => {
  const code = readFileSync(path, 'utf8');

  it('WP1-01: parses as ES5 and uses no ES2015+ syntax or built-ins', () => {
    expect(() => parse(code, { ecmaVersion: 5 })).not.toThrow();

    // Tokenize at the latest level so ES2015+ tokens would be recognised if they were there.
    const tokens: Token[] = [...tokenizer(code, { ecmaVersion: 'latest' })];
    const es2015 = tokens.filter(
      (t) =>
        t.type.keyword === 'class' ||
        t.type.keyword === 'const' ||
        t.type === tokTypes.arrow ||
        t.type === tokTypes.backQuote ||
        t.type === tokTypes.template ||
        (t.type === tokTypes.name && ['let', 'Promise'].includes(String(tokenValue(t)))),
    );
    expect(es2015).toEqual([]);

    const memberAccess = tokens.flatMap((t, i) =>
      t.type === tokTypes.name && tokens[i + 1]?.type === tokTypes.dot
        ? [`${String(tokenValue(t))}.${String(tokenValue(tokens[i + 2]))}`]
        : [],
    );
    expect(memberAccess).not.toContain('Object.assign');
    expect(memberAccess).not.toContain('Number.isNaN');
  });

  it('WP1-15: is at most 1.8 KB brotli', () => {
    expect(brotliCompressSync(code).length).toBeLessThanOrEqual(1800);
  });

  it('WP1-16: matches test/compat/v1.lock', () => {
    const lock = readFileSync(LOCK_PATH, 'utf8').trim();
    const sha = createHash('sha256').update(readFileSync(path)).digest('hex');
    // The lock changes only in a commit whose message carries [v1-change] (a review rule, not checked here).
    expect(sha, `frozen v1 file changed: ${path} no longer matches ${LOCK_PATH}`).toBe(lock);
  });
});

type Define = ((...args: unknown[]) => void) & { amd?: object };

/** Evaluates the artifact with the given module-system globals and a fake global object. */
function runUmd(env: { exports?: object; module?: { exports: unknown }; define?: Define }) {
  const fakeGlobal: Record<string, unknown> = {};
  compileFunction(artifact, ['exports', 'module', 'define', 'globalThis'])(
    env.exports,
    env.module,
    env.define,
    fakeGlobal,
  );
  return fakeGlobal;
}

function amdDefine(): Define {
  return Object.assign(vi.fn<(...args: unknown[]) => void>(), { amd: {} });
}

function isV1Class(value: unknown): boolean {
  return typeof value === 'function' && typeof value.prototype.getMarkerPosition === 'function';
}

describe('WP1-05: UMD branch order matches 1.1.1 (CommonJS, then AMD, then the global)', () => {
  it('assigns module.exports when CommonJS is present, even if AMD is too', () => {
    const module = { exports: {} };
    const define = amdDefine();
    const fakeGlobal = runUmd({ exports: module.exports, module, define });
    expect(isV1Class(module.exports)).toBe(true);
    expect(define).not.toHaveBeenCalled();
    expect(fakeGlobal).toEqual({});
  });

  it('calls define once with a factory that returns the class when only AMD is present', () => {
    const define = amdDefine();
    const fakeGlobal = runUmd({ define });
    expect(define).toHaveBeenCalledOnce();
    const factory: unknown = vi.mocked(define).mock.calls[0]?.at(-1);
    expect(typeof factory).toBe('function');
    expect(isV1Class(typeof factory === 'function' ? factory() : undefined)).toBe(true);
    expect(fakeGlobal).toEqual({});
  });

  it('ignores a define without define.amd and sets the global locationPicker', () => {
    const define = vi.fn<(...args: unknown[]) => void>();
    const fakeGlobal = runUmd({ define });
    expect(define).not.toHaveBeenCalled();
    expect(Object.keys(fakeGlobal)).toEqual(['locationPicker']);
    expect(isV1Class(fakeGlobal['locationPicker'])).toBe(true);
  });
});

describe('AMENDMENTS A1: the committed artifact is what `npm run build:v1` produces from src/compat/v1.ts', () => {
  it('scripts/minify-v1.mjs --check exits 0', { timeout: 60_000 }, () => {
    const result = spawnSync(process.execPath, ['scripts/minify-v1.mjs', '--check'], {
      encoding: 'utf8',
    });
    expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
  });
});
