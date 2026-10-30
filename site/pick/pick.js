// /pick/ (A12): ask a person for an exact location with nothing to install. State lives only in the URL: this page
// reads no storage, sets no cookies and sends nothing anywhere except where the link says, after a click.
//
// Return modes: default (result with copy buttons and Web Share); redirect=<https URL> (navigate there with lat, lng
// and address appended, after a click); return=postmessage&origin=<origin> (post to the opener or parent window,
// only to that origin, never '*').
import { copyFrom, formatsFor, lib } from '../lib.js';

const MESSAGE_TYPE = 'location-picker:pick';
const picker = /** @type {any} */ (document.getElementById('picker'));
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const params = new URLSearchParams(location.search);
const mode = resolveMode();

applyStartParams();
customElements.whenDefined('location-picker').then(start, () => {});

/** Picks the return mode from the URL; an invalid one shows why and falls back to showing the result. */
function resolveMode() {
  const redirect = params.get('redirect');
  const wantsPost = (params.get('return') ?? '').toLowerCase() === 'postmessage';
  if (redirect !== null && wantsPost) {
    return fail('This link asks for both a redirect and postMessage. Use one of them.');
  }
  if (redirect !== null) {
    const url = safeRedirect(redirect);
    return typeof url === 'string' ? fail(url) : { kind: 'redirect', url };
  }
  if (wantsPost) {
    const origin = exactOrigin(params.get('origin'));
    if (!origin) {
      return fail(
        'This link asks to send the location back but has no valid origin parameter (for example origin=https://example.com), so nothing will be sent.',
      );
    }
    return { kind: 'post', origin };
  }
  return { kind: 'show' };
}

function fail(message) {
  return { kind: 'show', error: message };
}

/** https only, no user name or password (they make a host look like another). Returns the URL or an error text. */
function safeRedirect(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return 'The redirect address in this link is not a valid URL, so it was ignored.';
  }
  if (url.protocol !== 'https:') {
    return 'The redirect address in this link is not https://, so it was ignored.';
  }
  if (url.username || url.password) {
    return 'The redirect address in this link contains a user name or password, so it was ignored.';
  }
  return url;
}

/** A bare http(s) origin such as https://example.com (a trailing slash is allowed), else null. */
function exactOrigin(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin === raw.replace(/\/$/, '') ? url.origin : null;
  } catch {
    return null;
  }
}

/** Before the element upgrades: ?lat=&lng= start the pin there, ?zoom= the zoom, ?lang= the search language. */
function applyStartParams() {
  const lat = Number.parseFloat(params.get('lat') ?? '');
  const lng = Number.parseFloat(params.get('lng') ?? '');
  const zoom = Number.parseFloat(params.get('zoom') ?? '');
  const lang = params.get('lang') ?? '';
  if (Number.isFinite(lat) && Number.isFinite(lng)) picker.setAttribute('value', `${lat},${lng}`);
  if (Number.isFinite(zoom) && zoom >= 1 && zoom <= 19) picker.setAttribute('zoom', String(zoom));
  if (/^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(lang)) picker.setAttribute('lang', lang);
}

function start() {
  showMode();
  for (const type of ['input', 'change', 'addresschange', 'ready'])
    picker.addEventListener(type, render);
  $('confirm').addEventListener('click', showResult);
  $('adjust').addEventListener('click', () => {
    $('result').hidden = true;
    $('action-show').hidden = false;
    $('confirm').focus();
  });
  $('send-redirect').addEventListener('click', sendRedirect);
  $('send-post').addEventListener('click', sendPost);
  for (const button of document.querySelectorAll('[data-copy]')) {
    button.addEventListener('click', () => {
      void copyFrom(
        button,
        button.dataset.text ?? '',
        button.querySelector('b')?.textContent ?? 'it',
      );
    });
  }
  if (typeof navigator.share === 'function') {
    $('share').hidden = false;
    $('share').addEventListener('click', () => void share());
  }
  render();
  const query = params.get('q');
  if (query && !picker.value) void searchFor(query);
}

async function searchFor(query) {
  try {
    await picker.ready;
    const [first] = await picker.geocode(query);
    if (first && !picker.value) picker.setLocation(first, { zoom: 17 });
  } catch {
    // No result: the person searches or pans by hand.
  }
}

function showMode() {
  if (mode.error) {
    $('mode-error').textContent = mode.error;
    $('mode-error').hidden = false;
  }
  $('action-show').hidden = mode.kind !== 'show';
  $('action-redirect').hidden = mode.kind !== 'redirect';
  $('action-post').hidden = mode.kind !== 'post';
  if (mode.kind === 'redirect') {
    $('dest-host').textContent = mode.url.host;
    $('dest-host-button').textContent = mode.url.host;
    $('pick-prompt').textContent =
      `Move the map until the pin marks the exact spot, then send it to ${mode.url.host}.`;
  }
  if (mode.kind === 'post') $('post-origin').textContent = mode.origin;
}

function render() {
  const at = picker.valueAsLatLng;
  const [lat, lng] = at ? lib().formatLatLng(at).split(',') : ['–', '–'];
  $('lat-out').textContent = lat;
  $('lng-out').textContent = lng;
  $('address-out').textContent =
    picker.address ?? (at ? 'Coordinates chosen.' : 'Drag the map, search, or use your location.');
  for (const id of ['confirm', 'send-redirect', 'send-post'])
    $(id).toggleAttribute('disabled', !at);
  const texts = at ? formatsFor(at, picker.zoom) : null;
  for (const button of document.querySelectorAll('[data-copy]')) {
    const text = texts?.[button.getAttribute('data-copy') ?? ''] ?? '';
    button.querySelector('span').textContent = text || '–';
    button.dataset.text = text;
  }
}

function showResult() {
  if (!picker.valueAsLatLng) return;
  $('action-show').hidden = true;
  $('result').hidden = false;
  $('result').querySelector('button')?.focus();
}

/** The picked point; `address` is null while unknown. */
function pickedLocation() {
  const at = picker.valueAsLatLng;
  if (!at) return null;
  const [lat, lng] = lib().formatLatLng(at).split(',').map(Number);
  return { lat, lng, address: picker.address ?? null };
}

function sendRedirect() {
  const picked = pickedLocation();
  if (!picked || mode.kind !== 'redirect') return;
  const url = new URL(mode.url);
  url.searchParams.set('lat', String(picked.lat));
  url.searchParams.set('lng', String(picked.lng));
  if (picked.address) url.searchParams.set('address', picked.address);
  location.assign(url.href);
}

function sendPost() {
  const picked = pickedLocation();
  if (!picked || mode.kind !== 'post') return;
  const target =
    window.opener && !window.opener.closed
      ? window.opener
      : window.parent !== window
        ? window.parent
        : null;
  if (!target) {
    $('post-status').textContent =
      'Nothing was sent: this page was not opened by another page (window.open or an iframe). The coordinates are below.';
    showResult();
    return;
  }
  target.postMessage({ type: MESSAGE_TYPE, ...picked }, mode.origin);
  $('post-status').textContent = window.opener
    ? `Sent to ${mode.origin}. You can close this window.`
    : `Sent to ${mode.origin}.`;
}

async function share() {
  const picked = pickedLocation();
  if (!picked) return;
  const links = formatsFor(picked, picker.zoom);
  try {
    await navigator.share({
      title: 'Location',
      text: picked.address ? `${picked.address} (${links.decimal})` : links.decimal,
      url: links.google,
    });
  } catch {
    // Cancelled or unavailable: the copy buttons remain.
  }
}
