// Landing page: the live picker doubles as a lat/long finder (copy buttons), with deep links (?lat=&lng=&zoom=&q=),
// an OpenStreetMap / Google switch (bring your own key, kept in localStorage only), RTL and field-mode toggles.
import { copyFrom, formatsFor, lib, setUpCodeBlocks, setUpTabs } from './lib.js';
import { setUpThemeToggle } from './theme.js';

const KEY_STORE = 'location-picker-site:google-key';
const picker = /** @type {any} */ (document.getElementById('picker'));
const form = /** @type {HTMLFormElement} */ (document.getElementById('demo-form'));
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

applyDeepLink();
setUpThemeToggle();
setUpCodeBlocks();
setUpTabs();
for (const button of document.querySelectorAll('[data-copy-text]')) {
  button.addEventListener('click', () => {
    void copyFrom(
      button,
      button.getAttribute('data-copy-text') ?? '',
      button.getAttribute('data-copy-what') ?? 'it',
    );
  });
}
form.addEventListener('submit', (event) => event.preventDefault());
customElements.whenDefined('location-picker').then(start, () => {});

/** Before the element upgrades: ?lat=&lng= is the initial value, ?zoom= the initial zoom. */
function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const lat = Number.parseFloat(params.get('lat') ?? '');
  const lng = Number.parseFloat(params.get('lng') ?? '');
  const zoom = Number.parseFloat(params.get('zoom') ?? '');
  if (Number.isFinite(lat) && Number.isFinite(lng)) picker.setAttribute('value', `${lat},${lng}`);
  if (Number.isFinite(zoom) && zoom >= 0 && zoom <= 22) picker.setAttribute('zoom', String(zoom));
}

function start() {
  picker.addEventListener('input', render);
  picker.addEventListener('change', (event) => {
    expectAddress();
    render();
    updateUrl(event.detail);
  });
  picker.addEventListener('addresschange', () => {
    lookingUp = false;
    render();
  });
  picker.addEventListener('ready', () => {
    render();
    watchZoom();
  });
  setUpCopyButtons();
  setUpProviderSwitch();
  setUpToggles();
  render();
  const query = new URLSearchParams(location.search).get('q');
  if (query && !picker.value) void searchFor(query);
}

/** ?q= searches with the picker's own geocoder and commits the first result. */
async function searchFor(query) {
  try {
    await picker.ready;
    const [first] = await picker.geocode(query);
    if (first && !picker.value) picker.setLocation(first, { zoom: 16 });
  } catch {
    // No result or no network: the map stays where it is.
  }
}

let lookingUp = false;
let lookupTimer = 0;
/** After a commit the address is pending for a moment (reverse geocoding is on); then "no address" is the answer. */
function expectAddress() {
  lookingUp = !picker.address;
  clearTimeout(lookupTimer);
  lookupTimer = window.setTimeout(() => {
    lookingUp = false;
    render();
  }, 5000);
}

function render() {
  const at = picker.valueAsLatLng;
  const { formatLatLng } = lib();
  $('lat-out').textContent = at ? formatLatLng(at).split(',')[0] : '–';
  $('lng-out').textContent = at ? formatLatLng(at).split(',')[1] : '–';
  const address = picker.address;
  $('address-out').textContent = address
    ? address
    : !at
      ? 'Drag the map, search, or use your location.'
      : lookingUp
        ? 'Looking up the address…'
        : 'No address for this point.';
  const texts = at ? { ...formatsFor(at, picker.zoom), link: deepLink(at) } : null;
  for (const button of document.querySelectorAll('[data-copy]')) {
    const text = texts?.[button.getAttribute('data-copy') ?? ''] ?? '';
    button.toggleAttribute('disabled', !text);
    button.querySelector('span').textContent = text || '–';
    button.dataset.text = text;
  }
  const entries = [...new FormData(form)].map(
    ([name, value]) => `${name}=${typeof value === 'string' ? value : value.name}`,
  );
  $('formdata-out').textContent = entries.join('  ') || '(nothing yet)';
}

function setUpCopyButtons() {
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', () => {
      const what = button.querySelector('b')?.textContent ?? 'it';
      void copyFrom(
        button,
        button.dataset.text ?? '',
        what.replace(/^[A-Z]/, (c) => c.toLowerCase()),
      );
    });
  }
}

/** The page URL for a point (keeps every other parameter, drops ?q=). */
function deepLink(at, zoom = picker.zoom) {
  const url = new URL(location.href);
  const [lat, lng] = lib().formatLatLng(at).split(',');
  url.searchParams.delete('q');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lng', lng);
  url.searchParams.set('zoom', String(Math.round(zoom)));
  return url.href;
}

/** A pan rewrites the address bar in place (replaceState: the back button still leaves the page). */
function updateUrl(detail) {
  if (!detail?.value) return;
  history.replaceState(history.state, '', deepLink(detail, detail.zoom ?? picker.zoom));
}

/** Zoom-only moves keep the link's zoom current (Leaflet and Google maps both expose a zoom event). */
function watchZoom() {
  const map = picker.map;
  const sync = () => {
    if (picker.valueAsLatLng) {
      history.replaceState(history.state, '', deepLink(picker.valueAsLatLng));
      render();
    }
  };
  if (typeof map?.on === 'function') map.on('zoomend', sync);
  else if (typeof map?.addListener === 'function') map.addListener('zoom_changed', sync);
}

// ---------------------------------------------------------------------------------------------------------------
// OpenStreetMap / Google. One element: its provider switch keeps the coordinates and clears the address, so Google
// content never sits next to an OpenStreetMap map (and the other way round).

function readKey() {
  try {
    return localStorage.getItem(KEY_STORE) ?? '';
  } catch {
    return '';
  }
}

function writeKey(key) {
  try {
    if (key) localStorage.setItem(KEY_STORE, key);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    // Blocked storage: the key then lasts for this page view only.
  }
}

let sessionKey = '';

function setUpProviderSwitch() {
  sessionKey = readKey();
  for (const radio of document.querySelectorAll('input[name="provider"]')) {
    radio.addEventListener('change', applyProvider);
  }
  $('key-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ ($('google-key'));
    sessionKey = input.value.trim();
    input.value = '';
    writeKey(sessionKey);
    applyProvider();
  });
  $('forget-key').addEventListener('click', () => {
    sessionKey = '';
    writeKey('');
    applyProvider();
    $('google-key').focus();
  });
  applyProvider();
}

function applyProvider() {
  const wantsGoogle = document.querySelector('input[name="provider"][value="google"]').checked;
  $('key-panel').hidden = !wantsGoogle;
  $('key-ask').hidden = Boolean(sessionKey);
  $('key-saved').hidden = !sessionKey;
  const next = wantsGoogle && sessionKey ? 'google' : 'leaflet';
  if (
    picker.getAttribute('provider') === next &&
    (next === 'leaflet' || picker.apiKey === sessionKey)
  )
    return;
  if (next === 'google') {
    picker.apiKey = sessionKey;
  } else {
    picker.removeAttribute('api-key');
  }
  picker.provider = next;
  render();
}

// ---------------------------------------------------------------------------------------------------------------

function setUpToggles() {
  const card = $('finder');
  $('rtl-toggle').addEventListener('change', (event) => {
    card.dir = event.currentTarget.checked ? 'rtl' : 'ltr';
  });
  // Field mode (A10) is shown only when this build of the element supports it.
  const element = customElements.get('location-picker');
  if (element?.observedAttributes?.includes('presentation')) {
    $('field-toggle-label').hidden = false;
    $('field-toggle').addEventListener('change', (event) => {
      picker.setAttribute('presentation', event.currentTarget.checked ? 'field' : 'inline');
    });
  }
}
