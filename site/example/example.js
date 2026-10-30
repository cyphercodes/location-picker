// /example/: the full demo (the URL old links point to). Attribute toggles, method buttons, a real form, a live
// state panel and an event log.
import { setUpThemeToggle } from '../theme.js';

const picker = /** @type {any} */ (document.getElementById('play'));
const form = /** @type {HTMLFormElement} */ (document.getElementById('play-form'));
const log = /** @type {HTMLOListElement} */ (document.getElementById('log'));

setUpThemeToggle();
customElements.whenDefined('location-picker').then(start, () => {});

function start() {
  for (const type of ['input', 'change', 'addresschange', 'ready', 'error']) {
    picker.addEventListener(type, (event) => {
      if (type === 'input' && log.firstElementChild?.dataset.type === 'input') log.firstElementChild.remove();
      record(type, event);
      renderState();
    });
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${typeof value === 'string' ? value : value.name}`,
    );
    document.getElementById('submitted-out').textContent = entries.join('  ') || '(no entries)';
  });
  form.addEventListener('invalid', () => renderState(), true);
  form.addEventListener('reset', () => setTimeout(renderState));
  document.getElementById('clear-log').addEventListener('click', () => log.replaceChildren());

  const calls = {
    paris: () => picker.setLocation(48.8584, 2.2945),
    locate: () => picker.locate().catch(() => {}),
    clear: () => {
      picker.value = '';
    },
  };
  for (const button of document.querySelectorAll('[data-call]')) {
    button.addEventListener('click', () => {
      calls[button.dataset.call]?.();
      renderState();
    });
  }
  for (const box of document.querySelectorAll('[data-attr]')) {
    box.addEventListener('change', () => {
      const on = box.dataset.on;
      if (on) picker.setAttribute(box.dataset.attr, box.checked ? on : 'pin');
      else picker.toggleAttribute(box.dataset.attr, box.checked);
      renderState();
    });
  }
  for (const select of document.querySelectorAll('[data-select]')) {
    select.addEventListener('change', () => {
      picker.setAttribute(select.dataset.select, select.value);
      renderState();
    });
  }
  renderState();
}

function record(type, event) {
  const detail = event.detail ?? {};
  const summary =
    type === 'error'
      ? `${detail.code ?? ''}: ${detail.message ?? ''}`
      : type === 'ready'
        ? `provider ${typeof detail.provider === 'string' ? detail.provider : detail.provider?.name ?? ''}`
        : type === 'addresschange'
          ? String(detail.address)
          : `${detail.value} · source ${detail.source}`;
  const item = document.createElement('li');
  item.dataset.type = type;
  const name = document.createElement('code');
  name.textContent = type;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString();
  const text = document.createElement('span');
  text.textContent = summary;
  item.append(name, text, time);
  log.prepend(item);
  while (log.children.length > 40) log.lastElementChild?.remove();
}

function renderState() {
  const at = picker.valueAsLatLng;
  const rows = {
    value: JSON.stringify(picker.value),
    valueAsLatLng: at ? `{ lat: ${at.lat}, lng: ${at.lng} }` : 'null',
    zoom: String(picker.zoom),
    address: picker.address === null ? 'null' : JSON.stringify(picker.address),
    'validity.valid': String(picker.validity?.valid),
    provider: String(picker.getAttribute('provider') ?? 'leaflet (default)'),
  };
  const list = document.getElementById('state');
  list.replaceChildren(
    ...Object.entries(rows).flatMap(([key, value]) => {
      const term = document.createElement('dt');
      term.textContent = key;
      const description = document.createElement('dd');
      description.textContent = value;
      return [term, description];
    }),
  );
}
