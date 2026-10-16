# Contributing

Thanks for helping with location-picker. Bug reports, documentation fixes and pull requests are all welcome.

## Reporting a bug

Open an [issue](https://github.com/cyphercodes/location-picker/issues/new/choose) with:

- the `code` and `Fix:` text from the console, if there is one (every failure is logged as
  `[location-picker] … Fix: …`);
- how you load the library (the script tag URL, or the npm entry you import) and its version;
- the provider (`leaflet`, `google`, `maplibre`) and whether you use the element or the class;
- the smallest page or component that reproduces the problem.

Security issues go by email instead: see [SECURITY.md](.github/SECURITY.md).

## Development

You need Node `>=22.22`.

```bash
git clone https://github.com/YOUR-USERNAME/location-picker
cd location-picker
npm ci
npx playwright install
```

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `npm run build`        | builds `dist/` and `custom-elements.json`     |
| `npm test`             | unit tests (jsdom)                            |
| `npm run test:browser` | browser tests in Chromium, Firefox and WebKit |
| `npm run test:e2e`     | Playwright end-to-end tests (after a build)   |
| `npm run lint`         | oxlint                                        |
| `npm run typecheck`    | TypeScript                                    |
| `npm run format`       | Prettier                                      |
| `npm run size`         | bundle size budgets                           |

[AGENTS.md](AGENTS.md) describes the repository layout, the test conventions and the rules in more detail; it is
written for AI coding agents but applies to everyone.

## Pull requests

- Keep each pull request to one change, and each commit atomic. Use conventional commit messages (`fix: …`,
  `feat: …`, `docs: …`).
- Add or update tests. Tests never use the real network: tiles, geocoders, Google Maps and CDNs are served from local
  fixtures.
- Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run format:check` before you push.
- Update the docs and `CHANGELOG.md` when behaviour or the public API changes. Code blocks in the README and `docs/`
  are executed by `npm run docs:test`, so keep them complete and runnable.
- Do not edit generated files (`docs/errors.md`, `site/llms-full.txt`, `custom-elements.json`, `COMPATIBILITY.md`) or
  the frozen v1 file `src/compat/location-picker.min.js`.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Please follow the
[code of conduct](code-of-conduct.md).
