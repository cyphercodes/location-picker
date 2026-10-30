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

## Ask a person for a location: the pick link

An agent, a chat bot, a support team or a no-code automation often needs one exact point from a person: a delivery door, a meeting point, the place of an incident. `https://cyphercodes.github.io/location-picker/pick/` is a hosted page for that, with nothing to install. Send the link; the person moves the map under the pin (or searches, or taps "Use my location") and confirms.

The page is static: no server, no storage, no cookies and no analytics. Everything it knows comes from its URL, and it sends the location only where the URL says, after the person clicks. It uses OpenStreetMap tiles and Photon search. For heavy use, host your own copy: it is the `site/pick/` folder of this MIT-licensed repository.

| Parameter                            | Effect                                                                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lat`, `lng`                         | A starting point for the person to confirm or adjust                                                                                                            |
| `zoom`                               | Starting zoom, 1 to 19                                                                                                                                          |
| `q`                                  | Search text; the first result is picked (when no `lat`/`lng` is given)                                                                                          |
| `lang`                               | Language of search results (for example `fr`)                                                                                                                   |
| `redirect=<https URL>`               | After a click, go there with `lat`, `lng` and (when known) `address` appended; existing query parameters are kept. `https://` only, and the host is shown first |
| `return=postmessage&origin=<origin>` | Post `{ type: 'location-picker:pick', lat, lng, address }` to the window that opened the page or embeds it, only to that exact origin (never `*`)               |

Without `redirect` or `return`, the page shows the result with copy buttons (decimal, DMS, `geo:` URI, Google Maps and OpenStreetMap links) and Web Share, so a person can paste it back into a chat. A link that asks for both `redirect` and `postmessage`, or a `postmessage` link without a valid `origin`, sends nothing and says why.

A redirect link and what the destination receives:

```text
https://cyphercodes.github.io/location-picker/pick/?q=Eiffel%20Tower&redirect=https%3A%2F%2Fexample.com%2Forders%2F42%2Flocation
-> https://example.com/orders/42/location?lat=48.85837&lng=2.294481&address=...
```

From a web page, open it in a popup (or an `<iframe>`; add `allow="geolocation"` for the locate button) and listen for the message:

```ts
interface PickMessage {
  type: 'location-picker:pick';
  lat: number;
  lng: number;
  address: string | null;
}

const pick = new URL('https://cyphercodes.github.io/location-picker/pick/');
pick.searchParams.set('return', 'postmessage');
pick.searchParams.set('origin', window.location.origin);
pick.searchParams.set('q', 'Eiffel Tower');
window.open(pick, 'pick', 'popup,width=480,height=720');

window.addEventListener('message', (event: MessageEvent<PickMessage>) => {
  if (event.origin !== 'https://cyphercodes.github.io') return;
  if (event.data?.type !== 'location-picker:pick') return;
  console.log(event.data.lat, event.data.lng, event.data.address);
});
```

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

With the `LocationPicker` class, call `registerWebMcpTools(picker)`: in 3.0 the class option `webmcp: true` does not register any tools yet (it arrives in 3.1). The element's `webmcp` attribute works.

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
