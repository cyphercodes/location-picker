// /embed/ (A11): a snippet generator. The options form becomes one copy-paste block pinned to location-picker@3, and
// the same block runs in a live preview (an iframe that swaps the CDN script for this site's local copy).
import { highlight, lib, setUpCodeBlocks } from '../lib.js';
import { setUpThemeToggle } from '../theme.js';

const CDN = 'https://cdn.jsdelivr.net/npm/location-picker@3';
const $ = (id) => /** @type {any} */ (document.getElementById(id));
const options = /** @type {HTMLFormElement} */ ($('options'));

setUpThemeToggle();
setUpCodeBlocks();

/** The generator's state, read from the options form. */
function readState() {
  const radio = (name) => options.querySelector(`input[name="${name}"]:checked`)?.value;
  const presentation = $('presentation').disabled ? 'inline' : $('presentation').value;
  return {
    google: radio('provider') === 'google',
    apiKey: $('api-key').value.trim(),
    presentation,
    label: $('label-text').value.trim(),
    height: clamp(Number.parseInt($('height').value, 10) || 360, 200, 900),
    search: $('opt-search').checked,
    locate: $('opt-locate').checked,
    required: $('opt-required').checked,
    output: radio('output') ?? 'single',
    name: $('name-single').value.trim() || 'location',
    latName: $('name-lat').value.trim() || 'lat',
    lngName: $('name-lng').value.trim() || 'lng',
    addressName: $('name-address').value.trim(),
    existing: $('opt-existing').checked,
    start: parseStart($('start-at').value),
    lang: $('lang').value,
    form: $('opt-form').checked,
    action: $('form-action').value.trim(),
  };
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** "Start at": anything parseLatLng reads (decimal, DMS, geo: URIs, map links), with the link's zoom when it has one. */
function parseStart(text) {
  if (!text.trim() || !lib()) return null;
  const parsed = lib().parseLatLng(text);
  return parsed ? { value: lib().formatLatLng(parsed), zoom: parsed.zoom } : undefined;
}

const attr = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const text = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;');

/** The snippet for a state: the script tag, an optional form, the label and the element. */
function buildSnippet(s) {
  const id = 'location-field';
  const attrs = [`id="${id}"`];
  if (s.google)
    attrs.push('provider="google"', `api-key="${attr(s.apiKey || 'YOUR_BROWSER_KEY')}"`);
  if (s.presentation !== 'inline') attrs.push(`presentation="${s.presentation}"`);
  const inputs = [];
  const fieldsFor = s.output === 'inputs';
  if (s.output === 'single') attrs.push(`name="${attr(s.name)}"`);
  if (s.output === 'separate')
    attrs.push(`lat-name="${attr(s.latName)}"`, `lng-name="${attr(s.lngName)}"`);
  if (s.output !== 'inputs' && s.addressName) attrs.push(`address-name="${attr(s.addressName)}"`);
  if (fieldsFor) {
    const bind = (kind, name) => {
      if (s.existing) {
        attrs.push(`${kind}-input="[name='${attr(name.replaceAll("'", ''))}']"`);
      } else {
        attrs.push(`${kind}-input="${id}-${kind}"`);
        inputs.push(`  <input type="hidden" id="${id}-${kind}" name="${attr(name)}">`);
      }
    };
    bind('lat', s.latName);
    bind('lng', s.lngName);
    if (s.addressName) bind('address', s.addressName);
  }
  if (s.start) attrs.push(`center="${s.start.value}"`, `zoom="${s.start.zoom ?? 15}"`);
  if (s.lang) attrs.push(`lang="${s.lang}"`);
  if (s.search) attrs.push('search');
  if (s.addressName) attrs.push('reverse-geocode');
  if (s.locate) attrs.push('locate="button"');
  if (s.required) attrs.push('required');
  attrs.push(`style="height: ${s.height}px"`);

  const element = [
    '<location-picker',
    ...attrs.map((a) => `  ${a}`),
    inputs.length ? `>\n${inputs.join('\n')}\n</location-picker>` : '></location-picker>',
  ].join('\n');
  const field = [s.label ? `<label for="${id}">${text(s.label)}</label>` : '', element]
    .filter(Boolean)
    .join('\n');
  const lines = [`<script src="${CDN}"></script>`];
  if (s.google) {
    lines.push(
      '<!-- Restrict the key by HTTP referrer. Enable Maps JavaScript API + Places API (New); Geocoding API for addresses. -->',
    );
  }
  if (s.form) {
    lines.push(
      `<form method="post" action="${attr(s.action || '/submit')}">`,
      indent(field),
      '  <button type="submit">Send</button>',
      '</form>',
    );
  } else {
    lines.push(field);
  }
  return lines.join('\n');
}

const indent = (block) =>
  block
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');

let previewTimer = 0;
function update() {
  const state = readState();
  $('key-field').hidden = !state.google;
  $('names-single').hidden = state.output !== 'single';
  $('names-split').hidden = state.output === 'single';
  $('existing-row').hidden = state.output !== 'inputs';
  $('action-field').hidden = !state.form;
  $('start-note').textContent =
    state.start === undefined
      ? 'Not a coordinate: try 48.8584, 2.2945, DMS or a map link.'
      : state.start
        ? `Starts at ${state.start.value}, zoom ${state.start.zoom ?? 15}.`
        : 'Paste coordinates, DMS or a map link. Empty: a world view.';
  const snippet = buildSnippet(state);
  const code = $('snippet-code');
  code.innerHTML = highlight(snippet);
  code.dataset.snippet = snippet;
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => renderPreview(state, snippet), 250);
}

/** Runs the snippet in the iframe with this site's local script build and Leaflet instead of the CDN. */
function renderPreview(state, snippet) {
  const frame = $('preview');
  if (state.google && !state.apiKey) {
    $('preview-note').textContent = 'Paste your Google Maps key above to preview Google Maps.';
    frame.srcdoc = page('<p class="note">The preview needs your Google Maps key.</p>');
    return;
  }
  $('preview-note').textContent = 'Submitting shows what your form would receive.';
  const base = new URL('../', location.href).href;
  const local = snippet.replace(
    `<script src="${CDN}"></script>`,
    `<link rel="stylesheet" href="${base}vendor/leaflet/leaflet.css">\n` +
      `<script src="${base}vendor/leaflet/leaflet.js"></script>\n<script src="${base}location-picker.global.js"></script>`,
  );
  // "My form already has these fields": stand in for the builder's own hidden fields.
  const existing =
    state.output === 'inputs' && state.existing
      ? [state.latName, state.lngName, state.addressName]
          .filter(Boolean)
          .map((name) => `<input type="hidden" name="${attr(name)}">`)
          .join('\n')
      : '';
  const body = state.form
    ? local.replace('</form>', `${existing}\n</form>`)
    : `<form>\n${local}\n${existing}\n<button type="submit">Send</button>\n</form>`;
  frame.srcdoc = page(`${body}\n<output id="sent"></output>\n<script>${PREVIEW_SCRIPT}</script>`);
}

const PREVIEW_SCRIPT = `
document.addEventListener('submit', (event) => {
  event.preventDefault();
  const entries = [...new FormData(event.target)].map(([k, v]) => k + '=' + v);
  document.getElementById('sent').textContent = entries.length ? 'Your form would send: ' + entries.join('  ') : 'Nothing to send yet.';
});`;

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  body { margin: 0; padding: 16px; }
  label { display: block; font-weight: 600; margin-block-end: 6px; }
  button[type=submit] { margin-block-start: 12px; min-block-size: 40px; padding: 0 16px; font: inherit; }
  output { display: block; margin-block-start: 10px; font: 13px/1.4 ui-monospace, Menlo, monospace; overflow-wrap: anywhere; }
  .note { color: GrayText; }
</style></head><body>${body}</body></html>`;

options.addEventListener('input', update);
options.addEventListener('change', update);
options.addEventListener('submit', (event) => event.preventDefault());
customElements.whenDefined('location-picker').then(
  () => {
    // Field mode (A10) only when this build of the element has it; the snippet never carries an ignored attribute.
    const supported = customElements
      .get('location-picker')
      ?.observedAttributes?.includes('presentation');
    $('presentation').disabled = !supported;
    $('presentation-note').hidden = Boolean(supported);
    update();
  },
  () => {},
);
update();
