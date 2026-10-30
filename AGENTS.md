# AGENTS.md

Instructions for AI coding agents (and humans) working on this repository. For using the package in an app, read
[README.md](README.md), [site/llms.txt](site/llms.txt) or [skills/location-picker/SKILL.md](skills/location-picker/SKILL.md) instead.
To ask a person for a location without writing code (agents, bots), send the hosted pick link
`https://cyphercodes.github.io/location-picker/pick/`, described in [docs/ai-agents.md](docs/ai-agents.md).

## Project

`location-picker` is a browser library: a form-associated `<location-picker>` custom element and an imperative
`LocationPicker` class that pick one latitude/longitude by panning a map under a fixed pin. TypeScript, no runtime
dependencies, engines (Leaflet, Google Maps, MapLibre) behind provider adapters, published to npm as ESM + CJS + a
script build (IIFE), plus a frozen v1 UMD file.

## Setup

- Node `>=22.22` (enforced by `devEngines`). npm ships with Node.
- `npm ci`
- Browser tests use Playwright's Chromium, Firefox and WebKit: `npx playwright install` once.

## Commands

| Command                     | What it does                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run build`             | `tsdown` (ESM, CJS, d.ts, IIFE, CSS into `dist/`) then `cem analyze` (`custom-elements.json`)         |
| `npm run typecheck`         | `tsc` over the sources, then over sources + tests + configs                                           |
| `npm run lint`              | `oxlint`, type-aware                                                                                  |
| `npm run format`            | `prettier --write .`                                                                                  |
| `npm run format:check`      | `prettier --check .`                                                                                  |
| `npm test`                  | unit tests (Vitest, jsdom)                                                                            |
| `npm run test:browser`      | browser tests (Vitest browser mode, Playwright: Chromium, Firefox, WebKit)                            |
| `npm run test:e2e`          | Playwright end-to-end tests, small matrix (needs `npm run build`, then `node scripts/build-site.mjs`) |
| `npm run compat`            | the full compatibility matrix (`COMPAT_FULL=1`); CI only (`compat.yml`)                               |
| `npm run size`              | `size-limit` budgets for every entry                                                                  |
| `npm run check:package`     | tarball file set, `publint`, `attw` and `size`                                                        |
| `npm run publint`           | `publint --strict`                                                                                    |
| `npm run attw`              | Are The Types Wrong, `node16` profile                                                                 |
| `npm run types-matrix`      | consumer type checks, the trimmed set CI runs on Node 24 (TS 5.9.3 and 7.0.2 x 3 resolutions)         |
| `npm run types-matrix:full` | every TypeScript version and module resolution (weekly `types-matrix.yml`; not locally)               |
| `npm run docs:test`         | extracts and runs the code blocks of the README, `site/llms.txt`, `SKILL.md` and `docs/`              |
| `npm run build:v1`          | regenerates the frozen v1 artifact (see below); `node scripts/minify-v1.mjs --check` verifies it      |

Generated documentation:

- `node scripts/gen-error-docs.mjs` writes `docs/errors.md` from `ERROR_TABLE` in `src/core/errors.ts`;
  `--check` fails when it is out of date.
- `node scripts/build-llms-full.mjs` writes `site/llms-full.txt` from the README and `docs/`; `--check` fails when it
  is out of date. Rerun it after editing any of those files.
- `node scripts/compat-report.mjs` writes `COMPATIBILITY.md` from `compat/compat.json` (which a compat run writes);
  `--check` fails when they disagree.
- `node test/fixtures/emit-google-maps-mock.mts` writes `e2e/fixtures/google-maps-mock.js` from
  `test/fixtures/google-maps-mock.ts`; `--check` fails when it is out of date (a unit test runs the check).

Other scripts:

- `node scripts/build-site.mjs` builds the GitHub Pages site into `_site/` (git-ignored) from `site/` and `dist/`; the
  site e2e specs need it.
- `node scripts/check-sri.mjs [--local]` checks the Leaflet SRI hashes in `src/providers/leaflet.ts` (release only).
- `node scripts/cdn-smoke.mjs --dry-run` lists the CDN URLs the release smoke checks after a publish.
- Playwright environment: `COMPAT_REPORT=1` writes `compat/compat.json` from a small run, `COMPAT_BROWSER=<engine>`
  narrows the matrix to one engine, `COMPAT_BLOB=<name>.zip` writes a blob report for `playwright merge-reports`.
- `smoke/` holds framework smoke apps (Angular, React 19, Vue 3, Next, Nuxt, …). They run in CI only (`smoke.yml`,
  against the packed tarball); never install them locally.

Before you finish a change: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`, and for anything
that touches runtime code `npm run build`, `npm run test:browser` and `npm run check:package`. After editing docs, run
`npm run docs:test` (after a build) and rebuild `site/llms-full.txt`.

## Layout

| Path                                                                   | Contents                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`, `core.ts`, `element.ts`, `utils.ts`                    | package entries (root, class only, element, DOM-free utilities)                 |
| `src/leaflet.ts`, `google.ts`, `maplibre.ts`, `photon.ts`, `webmcp.ts` | provider, geocoder and WebMCP entries                                           |
| `src/global.ts`                                                        | the script build (`window.LocationPicker`)                                      |
| `src/core/`, `src/utils/`, `src/styles/`                               | the engine-agnostic core, coordinate parsing and formatting, CSS                |
| `src/providers/`, `src/geocoders/`, `src/search/`                      | engine adapters, Photon and Google geocoders, the search combobox               |
| `src/element/`, `src/webmcp/`, `src/jsx/`                              | the custom element, WebMCP tools, JSX typings                                   |
| `src/internal/contracts.ts`                                            | internal interfaces shared by the modules (types only)                          |
| `src/compat/`                                                          | the frozen v1 file: source `v1.ts`, committed artifact `location-picker.min.js` |
| `types/`                                                               | hand-written declaration files copied into `dist/`                              |
| `test/`, `e2e/`                                                        | unit and browser tests; Playwright specs, matrix and harness                    |
| `docs/`, `README.md`, `skills/`, `site/llms.txt`                       | documentation (the skill ships in the npm package)                              |
| `site/`                                                                | GitHub Pages site: demo, `/example/`, `/embed/`, `/pick/`, `/compat/`           |
| `smoke/`, `types-matrix/`, `compat/`                                   | framework smoke apps, consumer type checks, the compatibility report            |
| `scripts/`                                                             | build, packaging and documentation scripts                                      |

## Rules

- **The public API is fixed.** Names, signatures, defaults and event shapes in the shipped `.d.ts` files are the
  contract, and their JSDoc is the source of `docs/api.md`. Keep JSDoc, `docs/api.md` and the README in sync when
  anything public changes, and add a CHANGELOG entry.
- **The v1 file is frozen.** `src/compat/location-picker.min.js` (shipped as `dist/location-picker.min.js`, the URL
  that old pages load unpinned) is byte-locked by `test/compat/v1.lock`. Change it only through `npm run build:v1`, in
  a commit whose message contains `[v1-change]`. Never edit the artifact by hand.
- **Generated files are never edited by hand:** `docs/errors.md`, `site/llms-full.txt`, `custom-elements.json`,
  `COMPATIBILITY.md`, `compat/compat.json`, `e2e/fixtures/google-maps-mock.js`, `dist/`, `_site/`.
- **Tests never touch the real network** (OpenStreetMap tiles, Photon, Google, jsDelivr). The route table in
  `test/fixtures/routes.ts` answers those URLs from local fixtures, and the no-network guard fails any test that tries
  another one, even when the code under test swallows the error.
- **Test file conventions.** `test/**/*.test.ts` runs in the unit project (jsdom). `test/**/*.browser.test.ts` runs
  only in the browser project; form-association (ElementInternals) assertions belong there. `e2e/**/*.spec.ts` is
  Playwright only and imports `test` and `expect` from `e2e/harness/fixtures.ts`. The e2e server listens on
  `127.0.0.1:$LP_PORT` (default 4173) and the Vitest browser server on `LP_PORT + 1`.
- **Size budgets** are enforced by `npm run size`. Keep engines, search and WebMCP out of the core: they are lazy
  chunks.
- **No browser support claims by hand.** Browser, device and framework results come from the generated
  `COMPATIBILITY.md` and the site's compatibility page; documentation links to them.
- **Map provider policies.** OpenStreetMap attribution stays visible. Google results are only shown on Google maps
  (geocoders are paired with providers). Photon is the default geocoder for Leaflet and MapLibre.
- **The `/pick/` page stays private.** No storage, cookies, analytics or server calls with the location; a redirect is
  `https://` only and happens after a click; `postMessage` goes only to the `origin` parameter, never `*`.

Nominatim must never become a default or appear in an example; its usage policy at
https://operations.osmfoundation.org/policies/nominatim/ forbids client-side autocomplete, and any mention of it in the
docs sits next to that link.

## Documentation code blocks

Every fenced block in the README, `site/llms.txt`, `skills/location-picker/SKILL.md` and `docs/*.md` is extracted and
run by `npm run docs:test`, according to its info string:

- `html` pages load through real navigation and must reach `ready` with no console errors; `ts`/`tsx` are type-checked
  against the packed package; `vue` is compiled; `blade` and `django` are rendered with fixture values and submitted;
  `php`, `python` and `bash` are syntax-checked; `jsonc` is parsed; `text` is not run.
- `<!-- doctest:project=angular -->` (or `next`, `nuxt`, `svelte`, `vue`) on the line before a fence compiles it in
  that framework's smoke app. `<!-- doctest:skip "reason" -->` skips a block, which is allowed only in `docs/*.md`.
- Prettier puts a blank line between such a comment and the fence, so wrap the pair in
  `<!-- prettier-ignore-start -->` / `<!-- prettier-ignore-end -->`. Use the same markers to keep a block byte-for-byte.
- Google examples use the literal key `YOUR_BROWSER_KEY`; it switches the tests to the Google Maps mock.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:` …), one logical change per commit.
