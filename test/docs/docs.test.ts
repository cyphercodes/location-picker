// The documentation acceptance checks (CONTRACT §13 WP7): the README opening, the "Common mistakes" box, llms.txt,
// SKILL.md, AGENTS.md commands, CHANGELOG and migration rows, LICENSE, Nominatim, browser claims, context7.json, the
// framework event table and the React hydration recipe, and the two generated files.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extract } from '../../scripts/extract-snippets.mjs';

const read = (file: string) => readFileSync(file, 'utf8');
const AI_FILES = ['README.md', 'site/llms.txt', 'skills/location-picker/SKILL.md'];
const DOCS = readdirSync('docs')
  .filter((name) => name.endsWith('.md'))
  .map((name) => `docs/${name}`);
const PROSE = [...AI_FILES, ...DOCS];
const blocksOf = (file: string) => extract(file, read(file)).blocks;
const NOMINATIM_POLICY = 'https://operations.osmfoundation.org/policies/nominatim/';
/** Every .html file under a directory. */
const siteHtml = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(path).isDirectory()) return siteHtml(path);
    return name.endsWith('.html') ? [path] : [];
  });
/** The §3.10 event table of a file (its lines from the header row on), or why it is missing. */
const tableOf = (file: string) => {
  const text = read(file);
  const start = text.indexOf(
    '| Framework | `change` | `input` | `addresschange` | `ready` | `error` |',
  );
  if (start < 0) return `${file} has no §3.10 event table`;
  const lines = text.slice(start).split('\n');
  const end = lines.findIndex((line) => !line.startsWith('|'));
  return lines.slice(0, end).join('\n');
};
/** Runs a generator script in --check mode; it throws when the generated file is out of date. */
const check = (script: string) =>
  execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' });

describe('WP7-01: the README opening', () => {
  const opening = read('README.md').split('\n').slice(0, 40).join('\n');
  const { description } = JSON.parse(read('package.json')) as { description: string };

  it('holds the description, the §8a snippet, npm i and the demo link', () => {
    expect(opening).toContain(description);
    expect(opening).toContain(
      '<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>',
    );
    expect(opening).toContain('<location-picker id="where" search locate="button"');
    expect(opening).toContain('npm i location-picker');
    expect(opening).toContain('(https://cyphercodes.github.io/location-picker/)');
  });
});

describe('WP7-02: a "Common mistakes" box in each AI-facing file', () => {
  const topics = [
    'dist/location-picker.min.js', // the unpinned v1 URL
    'Latitude first, no arrays',
    'Choose Google explicitly',
    '`required` on the picker',
    '.serialize()',
    "`import 'location-picker'` defines the element",
    'valueAsLatLng',
    'getMarkerPosition()',
    'The `lat`/`lng` attributes are the initial value only',
    'hydrateRoot',
    'MapLibre CSS is yours to load',
  ];
  it.each(AI_FILES)('%s', (file) => {
    const text = read(file);
    const start = text.search(/^(## |\*\*)Common mistakes/m);
    expect(start).toBeGreaterThan(-1);
    const box = text.slice(start, start + 6000);
    expect(topics.filter((topic) => !box.includes(topic))).toEqual([]);
  });
});

describe('WP7-03: llms.txt', () => {
  const text = read('site/llms.txt');

  it('follows the llms.txt format and stays within 10 KB', () => {
    expect(text.startsWith('# location-picker\n')).toBe(true);
    expect(text).toMatch(/^> \S/m);
    const sections = ['## Docs', '## Examples', '## Optional'];
    expect(sections.filter((section) => !text.includes(section))).toEqual([]);
    expect(text).toMatch(/^## Docs\n\n- \[[^\]]+\]\(https:\/\/[^)]+\)/m);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(10 * 1024);
  });

  it('llms-full.txt is regenerated identically (run twice)', () => {
    expect(() => check('scripts/build-llms-full.mjs')).not.toThrow();
    expect(() => check('scripts/build-llms-full.mjs')).not.toThrow();
  });
});

describe('WP7-04: SKILL.md frontmatter', () => {
  const text = read('skills/location-picker/SKILL.md');
  const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';

  it('names the skill and keeps the description within 1024 characters', () => {
    expect(frontmatter).toMatch(/^name: location-picker$/m);
    const folded = /^description: >-\n((?: {2}.*\n?)+)/m.exec(frontmatter)?.[1] ?? '';
    const description = folded
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ');
    expect(description.length).toBeGreaterThan(100);
    expect(description.length).toBeLessThanOrEqual(1024);
  });
});

describe('WP7-05: AGENTS.md commands exist', () => {
  const { scripts } = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const missing = (names: string[]) => names.filter((name) => !(name in scripts));
  const named = [...read('AGENTS.md').matchAll(/`npm run ([\w:-]+)/g)].map(
    (match) => match[1] ?? '',
  );

  it('every `npm run <script>` is a package.json script, including the required ones', () => {
    expect(named.length).toBeGreaterThan(0);
    expect(missing(named)).toEqual([]);
    expect(missing(['build', 'test', 'test:browser', 'lint', 'size', 'compat'])).toEqual([]);
  });
});

describe('WP7-06: CHANGELOG and migration rows', () => {
  const changelog = read('CHANGELOG.md');
  const section = (version: string) =>
    changelog.split(/^(?=## \[)/m).find((s) => s.startsWith(`## [${version}]`)) ?? '';
  // The §6 "Break", "Default changed" and "Changed" rows, by the API they name.
  const rows = [
    '`.map`',
    'Implicit Google provider',
    '`setCurrentPosition`',
    '`onLocationChange',
    '`.centerMarker`',
    '`"type": "module"`',
  ];

  it('2.1.0 states the MIT relicensing', () => {
    expect(section('2.1.0')).toMatch(/MIT License/);
    expect(section('2.1.0')).toMatch(/all prior versions/);
  });

  it('3.0.0 lists every breaking, default-changed and changed row and the MIT grant', () => {
    const notes = section('3.0.0');
    const headings = ['### Breaking', '### Default changed', '### Changed'];
    expect(headings.filter((heading) => !notes.includes(heading))).toEqual([]);
    expect(rows.filter((row) => !notes.includes(row))).toEqual([]);
    expect(notes).toMatch(/MIT License applies to this release and to all prior versions/);
  });

  it('docs/migration.md lists the same rows', () => {
    const migration = read('docs/migration.md');
    const statuses = ['**Break**', '**Default changed**', '**Changed**'];
    expect(statuses.filter((status) => !migration.includes(status))).toEqual([]);
    expect(rows.filter((row) => !migration.includes(row))).toEqual([]);
  });
});

describe('WP7-07: LICENSE', () => {
  it('is the MIT text with the 2018-2026 copyright line', () => {
    const license = read('LICENSE');
    expect(license.startsWith('MIT License\n')).toBe(true);
    expect(license).toContain('Copyright (c) 2018-2026 Rayan Salhab');
    expect(license).toContain('Permission is hereby granted, free of charge');
  });
});

describe('WP7-08: docs/migration.md names every v1 and v2 API', () => {
  const names = [
    'locationPicker',
    'location-picker/v1',
    "require('location-picker')",
    'LocationPicker',
    'mapOptions',
    'getMarkerPosition()',
    'setLocation(lat, lng)',
    'setCurrentPosition()',
    'setCurrentPosition',
    'onLocationChange',
    'useAdvancedMarker',
    'destroy()',
    'location-picker/style.css',
    '.map',
    '.element',
    'centerMarker',
    "'idle'",
    'Tripoli',
  ];
  it.each(names)('%s', (name) => expect(read('docs/migration.md')).toContain(name));
});

describe('WP7-09: docs/errors.md is generated', () => {
  it('matches ERROR_TABLE', () => {
    expect(() => check('scripts/gen-error-docs.mjs')).not.toThrow();
  });
});

describe('WP7-10: Nominatim', () => {
  it.each([...PROSE, 'AGENTS.md'])(
    '%s: every mention sits next to the usage policy, never in code',
    (file) => {
      const text = read(file);
      const prose = text.replace(/^```[\s\S]*?^```/gm, '');
      const unlinked = prose
        .split(/\n\s*\n/)
        .filter(
          (paragraph) => /nominatim/i.test(paragraph) && !paragraph.includes(NOMINATIM_POLICY),
        );
      expect(unlinked).toEqual([]);
      const inCode = blocksOf(file).filter((block) => /nominatim/i.test(block.code));
      expect(inCode.map((block) => block.id)).toEqual([]);
    },
  );

  it('the site pages mention it only with the policy', () => {
    const pages = siteHtml('site');
    expect(pages.length).toBeGreaterThan(0);
    const unlinked = pages.filter((file) => {
      const text = read(file);
      return /nominatim/i.test(text) && !text.includes(NOMINATIM_POLICY);
    });
    expect(unlinked).toEqual([]);
  });
});

describe('WP7-11: no hand-written browser support claims', () => {
  it.each(PROSE)('%s', (file) => {
    const text = read(file);
    expect(text).not.toMatch(/\b(Chrome|Chromium|Firefox|Safari|Edge|WebKit|Opera)\s+\d+/);
    expect(text).not.toMatch(/\b(all|modern|evergreen|every) (major )?browsers\b/i);
  });

  it('the README links the generated compatibility results', () => {
    expect(read('README.md')).toContain('(COMPATIBILITY.md)');
  });
});

describe('WP7-12: context7.json', () => {
  it('is valid JSON with the Context7 fields', () => {
    const config: unknown = JSON.parse(read('context7.json'));
    expect(config).toMatchObject({
      $schema: 'https://context7.com/schema/context7.json',
      projectTitle: expect.any(String),
      description: expect.any(String),
    });
    const lists = ['excludeFolders', 'excludeFiles', 'rules'].map((key) =>
      Reflect.get(Object(config), key),
    );
    const notStringLists = lists.filter(
      (list) => !Array.isArray(list) || list.some((entry) => typeof entry !== 'string'),
    );
    expect(notStringLists).toEqual([]);
  });
});

describe('WP7-14: event table, hydration recipe and result reading in the AI-facing files', () => {
  const canonical = tableOf('docs/frameworks.md');

  it('the table has every framework row', () => {
    const frameworks = ['Plain JS', 'React 19', 'Vue 3', 'Angular', 'Svelte 5', 'Solid', 'Preact'];
    expect(frameworks.filter((name) => !canonical.includes(`| ${name} |`))).toEqual([]);
    expect(canonical).toContain('`onerror` (NOT `onError`');
  });

  it.each(AI_FILES)('%s: the same table, the recipe and no getMarkerPosition() reads', (file) => {
    expect(tableOf(file)).toBe(canonical);
    const text = read(file);
    expect(text).toContain('**React hydration recipe.**');
    expect(text).toContain('ref={(el) => {');
    const blocks = blocksOf(file);
    // The §8h upgrade example is v1/v2 code, so it may read getMarkerPosition().
    const reads = blocks.filter(
      (block) =>
        block.code.includes('getMarkerPosition(') &&
        !block.code.includes("from 'location-picker/v1'"),
    );
    expect(reads.map((block) => block.id)).toEqual([]);
    // Framework templates bind value, never lat/lng.
    const latBindings = blocks.filter((block) =>
      /(\s:lat=|\s\[lat\]=|\slat=\{|v-model:lat)/.test(block.code),
    );
    expect(latBindings.map((block) => block.id)).toEqual([]);
  });
});
