# AI agents

location-picker is written to be used correctly by coding agents as well as people: predictable names, loud errors with fixes, and documentation in the formats agents read.

## For agents writing code that uses location-picker

| Resource                                                                     | What it is                                                                                                                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [llms.txt](https://cyphercodes.github.io/location-picker/llms.txt)           | A short overview with the key rules, one runnable example and links ([llms.txt format](https://llmstxt.org/))                                                |
| [llms-full.txt](https://cyphercodes.github.io/location-picker/llms-full.txt) | The README and every page of `docs/` in one file                                                                                                             |
| `skills/location-picker/SKILL.md`                                            | An [Agent Skill](https://agentskills.io/), shipped in the npm package (`node_modules/location-picker/skills/location-picker/SKILL.md`) and in the repository |
| `custom-elements.json`                                                       | Custom Elements Manifest for the element (the package's `customElements` field): attributes, properties, events, parts, slots, states and CSS properties     |
| The `.d.ts` files                                                            | JSDoc with `@default` and `@example` on every option; the [API reference](api.md) quotes the same text                                                       |
| `context7.json`                                                              | Indexing configuration for [Context7](https://context7.com/)                                                                                                 |

To add the skill to a project with the skills CLI: `npx skills add cyphercodes/location-picker`.

### Rules that prevent most mistakes

1. Load `https://cdn.jsdelivr.net/npm/location-picker@3`, never the unpinned `/dist/location-picker.min.js` (that is the frozen v1 file).
2. `import 'location-picker'` defines `<location-picker>`; `location-picker/core` is the class only.
3. Latitude first: `"lat,lng"` strings or `{ lat, lng }` objects, never arrays.
4. In forms, use `name` (or `lat-name`/`lng-name`), or `lat-input`/`lng-input` for existing inputs. Put `required` on the picker.
5. Bind `value` in frameworks and listen to `change`/`input`. Never bind `lat`/`lng`.
6. Read the result from `value`/`valueAsLatLng` or the `change` event's `detail`, not `getMarkerPosition()`.
7. OpenStreetMap needs no key. Choose Google explicitly (`provider="google"` + `api-key`).
8. In React, the lowercase `onaddresschange`/`onready`/`onerror`; after `hydrateRoot`, set objects and listeners in a ref.

The full list with explanations is the "Common mistakes" section of the [README](../README.md#common-mistakes).

### Debugging from the console

Every failure carries a stable `code` and a `fix`, in the form `[location-picker] <what happened>. Fix: <fix>`. Misspelled attributes (`latitude=`, `api_key=`, `lon=`, …) and unknown options log a warning that names the right one. The codes are listed in [errors.md](errors.md).

## WebMCP tools (experimental)

[WebMCP](https://developer.chrome.com/docs/ai/webmcp/imperative-api) lets a page expose tools to an AI agent running in the browser. location-picker can register tools that read and set its location, so an agent does not have to drag a map. It is off by default, feature-detected, and does nothing where WebMCP is unavailable. The WebMCP API itself is still experimental and may change.

Turn it on with the `webmcp` attribute:

```html
<form method="post" action="/deliveries">
  <label for="drop">Drop-off point</label>
  <location-picker id="drop" name="dropoff" search webmcp style="height: 360px"></location-picker>
  <button>Continue</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

Or call `registerWebMcpTools()` to describe what the location is for:

```ts
import 'location-picker';
import { isWebMcpSupported, registerWebMcpTools } from 'location-picker/webmcp';

const picker = document.querySelector('location-picker');
if (picker && isWebMcpSupported()) {
  const registration = registerWebMcpTools(picker, {
    purpose: 'Delivery drop-off point for this order.',
  });
  console.log(registration.tools); // e.g. ['location_picker_get_location', 'location_picker_set_location', …]
}
```

| Tool                     | Input                        | Result                                                                                      |
| ------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `<prefix>_get_location`  | none (read-only)             | `{ value, lat, lng, address }`, or `{ value: "" }` while unset                              |
| `<prefix>_set_location`  | `{ lat, lng }` or `{ text }` | commits like `setLocation()` (source `api`); `text` is parsed as coordinates, else geocoded |
| `<prefix>_search_places` | `{ query }` (read-only)      | up to 5 results, not committed; registered only when a geocoder is available                |

- The prefix is `location_picker`, plus `_<id or name>` when the page has several pickers. Override it with `prefix`.
- There is never a locate tool: agents must not trigger permission prompts.
- An out-of-range latitude in `set_location` is a tool error, and nothing is committed.
- `unregister()` or aborting `signal` removes the tools.

## For agents working on this repository

Read [AGENTS.md](../AGENTS.md): commands, layout, file ownership, test conventions and the rules for generated and frozen files.
