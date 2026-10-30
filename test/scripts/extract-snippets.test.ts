// The doc-snippet extractor (CONTRACT §12.7, WP5-11): fences, tags, the tagging rules and the template fixtures.
// The last block runs the rules over the real documentation, so `npm test` catches an untagged or skipped block
// before the slower `npm run docs:test` does.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SEED,
  checkRules,
  docFiles,
  extract,
  pageFor,
  renderTemplate,
  runnerOf,
  stripJsonComments,
  type DocBlock,
} from '../../scripts/extract-snippets.mjs';

const fence = (lang: string, code: string, marker = '```') =>
  `${marker}${lang}\n${code}\n${marker}`;
const md = (...lines: string[]) => lines.join('\n');
const rules = (file: string, text: string) => checkRules(file, extract(file, text).blocks, text);
const block = (lang: string, extra: Partial<DocBlock> = {}): DocBlock => ({
  id: 'x:1',
  file: 'x',
  line: 1,
  lang,
  code: '',
  ...extra,
});

describe('extract', () => {
  it('finds backtick and tilde fences with their line, info string and body', () => {
    const text = md(
      '# T',
      '',
      fence('HTML', '<p>a</p>'),
      '',
      fence('ts title="x"', 'let a = 1;', '~~~'),
    );
    const { blocks, problems } = extract('docs/x.md', text);
    expect(problems).toEqual([]);
    expect(blocks.map(({ id, lang, code }) => ({ id, lang, code }))).toEqual([
      { id: 'docs/x.md:3', lang: 'html', code: '<p>a</p>' },
      { id: 'docs/x.md:7', lang: 'ts', code: 'let a = 1;' },
    ]);
  });

  it('closes a fence only with the same character and at least the same length', () => {
    const text = md('````md', '```ts', 'inner', '```', '~~~', '````');
    const { blocks } = extract('docs/x.md', text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.code).toBe('```ts\ninner\n```\n~~~');
  });

  it('reports a fence that is never closed', () => {
    expect(extract('docs/x.md', md('```ts', 'let a;')).problems).toEqual([
      'docs/x.md:1: the fence is never closed',
    ]);
  });

  it('reads tags inside prettier-ignore wrappers and across one blank line', () => {
    const text = md(
      '<!-- prettier-ignore-start -->',
      '<!-- doctest:project=angular -->',
      fence('ts', 'a'),
      '<!-- prettier-ignore-end -->',
      '',
      '<!-- doctest:skip "needs a server" -->',
      '',
      fence('html', 'b'),
    );
    const { blocks, problems } = extract('docs/x.md', text);
    expect(problems).toEqual([]);
    expect(blocks.map((b) => [b.project, b.skip])).toEqual([
      ['angular', undefined],
      [undefined, 'needs a server'],
    ]);
  });

  it('rejects detached and unknown tags', () => {
    const detached = md('<!-- doctest:skip "far" -->', '', '', fence('ts', 'a'));
    expect(extract('docs/x.md', detached).problems).toEqual([
      'docs/x.md:1: a doctest tag must be on the line before a fence (one blank line allowed)',
    ]);
    const unknown = md('<!-- doctest:project=ember -->', fence('ts', 'a'));
    expect(extract('docs/x.md', unknown).problems[0]).toMatch(
      /unknown doctest tag "project=ember"/,
    );
    const reasonless = md('<!-- doctest:skip -->', fence('ts', 'a'));
    expect(extract('docs/x.md', reasonless).problems[0]).toMatch(/unknown doctest tag "skip"/);
  });
});

describe('checkRules', () => {
  it('allows skips only in docs/*.md', () => {
    const text = md('<!-- doctest:skip "why" -->', fence('ts', 'a'), fence('bash', 'ls'));
    expect(rules('docs/x.md', text)).toEqual([]);
    for (const file of ['README.md', 'site/llms.txt', 'skills/location-picker/SKILL.md']) {
      expect(rules(file, text)).toEqual([
        `${file}:2 (\`\`\`ts): doctest:skip is allowed only in docs/*.md (zero skips in ${file})`,
      ]);
    }
  });

  it('needs a runner for every info string', () => {
    expect(rules('docs/x.md', fence('', 'a'))[0]).toMatch(/a fence needs an info string/);
    expect(rules('docs/x.md', fence('svelte', 'a'))[0]).toMatch(/no runner for ```svelte/);
    expect(rules('docs/x.md', md('<!-- doctest:project=svelte -->', fence('svelte', 'a')))).toEqual(
      [],
    );
    expect(rules('docs/x.md', fence('text', 'tree/'))).toEqual([]);
  });

  it('needs a runnable block in each AI-facing file', () => {
    expect(rules('README.md', fence('text', 'a'))).toEqual([
      'README.md: needs at least one runnable block (WP5-11)',
    ]);
  });

  it('sorts blocks into runners', () => {
    expect(
      [
        block('html'),
        block('django'),
        block('tsx'),
        block('jsonc'),
        block('text'),
        block('svelte', { project: 'svelte' }),
        block('html', { skip: 'r' }),
      ].map(runnerOf),
    ).toEqual(['browser', 'browser', 'node', 'node', 'text', 'project', 'skip']);
  });
});

describe('template fixtures (§12.7)', () => {
  const blade = md(
    `<form method="POST" action="{{ route('stores.update', $store) }}">`,
    '  @csrf',
    "  @method('PUT')",
    '  {{-- a comment',
    '       on two lines --}}',
    `  <input id="lat" name="lat" value="{{ old('lat', $store->lat) }}">`,
    `  <input id="lng" name="lng" value="{{ old('lng', $store->lng) }}">`,
    "  @error('lat') <p>{{ $message }}</p> @enderror",
    '</form>',
    '<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>',
  );
  const django = md(
    '{% load l10n %}',
    '<location-picker lat-input="lat" lng-input="lng" required>',
    `  <input id="lat" name="lat" value="{{ form.lat.value|default_if_none:''|unlocalize }}">`,
    `  <input id="lng" name="lng" value="{{ form.lng.value|default_if_none:''|unlocalize }}">`,
    '  {# note #}{{ other }}',
    '</location-picker>',
  );

  it('renders Blade with the fixture values', () => {
    expect(renderTemplate(blade)).toBe(
      md(
        '<form method="POST" action="/echo">',
        '  <input type="hidden" name="_token" value="test">',
        '  <input type="hidden" name="_method" value="PUT">',
        '  ',
        `  <input id="lat" name="lat" value="${SEED.lat}">`,
        `  <input id="lng" name="lng" value="${SEED.lng}">`,
        '  ',
        '</form>',
        '<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>',
      ),
    );
  });

  it('renders Django with the fixture values', () => {
    const html = renderTemplate(django);
    expect(html).not.toMatch(/\{[{%#]/);
    expect(html).toContain(`name="lat" value="${SEED.lat}"`);
    expect(html).toContain(`name="lng" value="${SEED.lng}"`);
  });

  it('posts a bare template from a wrapping form and adds the local IIFE only when needed', () => {
    const base = { file: 'docs/forms.md', line: 1, code: '' };
    const page = pageFor({ ...base, id: 'django', lang: 'django', code: django });
    expect(page.html).toContain('<form method="post" action="/echo">');
    expect(page.html).toContain('<script src="/dist/location-picker.global.js"></script>');
    expect(page).toMatchObject({ seed: `${SEED.lat},${SEED.lng}`, fields: ['lat', 'lng'] });
    const bladePage = pageFor({ ...base, id: 'blade', lang: 'blade', code: blade });
    expect(bladePage.html).not.toContain('/dist/location-picker.global.js');
    expect(bladePage.html.match(/<form/g)).toHaveLength(1);
  });

  it('wraps html fragments in a page and keeps full pages as they are', () => {
    const base = { id: 'x', file: 'README.md', line: 1, lang: 'html' };
    const fragment = pageFor({ ...base, code: '<div id="map"></div>' }).html;
    expect(fragment).toMatch(/^<!doctype html>[\s\S]*<div id="map"><\/div>[\s\S]*<\/html>\n$/);
    const full = '<!doctype html>\n<title>x</title>';
    expect(pageFor({ ...base, code: full }).html).toBe(full);
  });
});

describe('stripJsonComments', () => {
  it('drops comments outside strings only', () => {
    const jsonc = '{\n  // a\n  "url": "https://x.test/a//b", /* b */ "n": "\\"//\\""\n}';
    expect(JSON.parse(stripJsonComments(jsonc))).toEqual({
      url: 'https://x.test/a//b',
      n: '"//"',
    });
  });
});

describe('the repository documentation', () => {
  it('follows the tagging rules', () => {
    const problems: string[] = [];
    for (const file of docFiles()) {
      const text = readFileSync(file, 'utf8');
      const extracted = extract(file, text);
      problems.push(...extracted.problems, ...checkRules(file, extracted.blocks, text));
    }
    expect(problems).toEqual([]);
  });

  it('runs at least one block of README, llms.txt and SKILL.md, and skips none', () => {
    for (const file of ['README.md', 'site/llms.txt', 'skills/location-picker/SKILL.md']) {
      const runners = extract(file, readFileSync(file, 'utf8')).blocks.map(runnerOf);
      expect({ file, skipped: runners.includes('skip') }).toEqual({ file, skipped: false });
      expect({ file, runnable: runners.some((r) => r !== 'text') }).toEqual({
        file,
        runnable: true,
      });
    }
  });
});
