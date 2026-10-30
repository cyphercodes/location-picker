// Helpers shared by the site's pages. Nothing here touches storage, cookies or the network, so /pick/ can use it.
// Formatting goes through the library itself (window.LocationPicker, from the local script build).

const SITE = 'https://cyphercodes.github.io/location-picker/';

/** The script build's statics; available once location-picker.global.js has run. */
export const lib = () => /** @type {any} */ (globalThis).LocationPicker;

/**
 * Every shareable form of one coordinate (WP6-07): decimal, DMS, a geo: URI, Google Maps and OpenStreetMap links.
 * @param {{ lat: number, lng: number }} at
 * @param {number} [zoom]
 */
export function formatsFor(at, zoom = 17) {
  const { formatLatLng } = lib();
  const value = formatLatLng(at);
  const [lat, lng] = value.split(',');
  const z = Math.round(Math.min(19, Math.max(1, zoom)));
  return {
    decimal: formatLatLng(at, { separator: ', ' }),
    dms: formatLatLng(at, { format: 'dms' }),
    geo: `geo:${value}`,
    google: `https://www.google.com/maps/search/?api=1&query=${value}`,
    osm: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${z}/${lat}/${lng}`,
  };
}

/** Writes text to the clipboard; falls back to a hidden textarea where the Clipboard API is missing. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;inset-block-start:-1000px;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

let toastTimer = 0;
/** Shows a short status message; the toast element is a polite live region. */
export function toast(message) {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.setAttribute('data-show', '');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.removeAttribute('data-show'), 1800);
}

/** Copies, then marks the button and announces it. */
export async function copyFrom(button, text, what) {
  const ok = await copyText(text);
  toast(ok ? `Copied ${what}` : 'Copy failed: select the text and copy it by hand');
  if (!ok) return;
  button.setAttribute('data-copied', '');
  setTimeout(() => button.removeAttribute('data-copied'), 1600);
}

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** A small HTML/JS highlighter for the snippets: comments, tags, attribute names and quoted strings. */
export function highlight(code) {
  const pattern =
    /(<!--[\s\S]*?-->|\/\/[^\n]*)|(<\/?[a-zA-Z][\w-]*)|(\s[a-zA-Z_:@][\w:.-]*)(?==)|("[^"\n]*"|'[^'\n]*'|`[^`]*`)/g;
  let html = '';
  let last = 0;
  for (const match of code.matchAll(pattern)) {
    html += escapeHtml(code.slice(last, match.index));
    const [text, comment, tag, attr] = match;
    const kind = comment ? 'com' : tag ? 'tag' : attr ? 'attr' : 'str';
    html += `<span class="tok-${kind}">${escapeHtml(text)}</span>`;
    last = match.index + text.length;
  }
  return html + escapeHtml(code.slice(last));
}

/** Highlights every `.code pre code` under root and wires its copy button. */
export function setUpCodeBlocks(root = document) {
  for (const figure of root.querySelectorAll('.code')) {
    const code = figure.querySelector('pre code');
    if (!code) continue;
    // Scrollable code must be reachable by keyboard.
    code.parentElement?.setAttribute('tabindex', '0');
    if (!code.hasAttribute('data-plain')) code.innerHTML = highlight(code.textContent ?? '');
    figure.querySelector('.copy-code')?.addEventListener('click', (event) => {
      void copyFrom(event.currentTarget, code.textContent ?? '', 'the code');
    });
  }
}

/** Accessible tabs: arrow keys move between tabs, each tab shows its panel. */
export function setUpTabs(root = document) {
  for (const list of root.querySelectorAll('[role="tablist"]')) {
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const select = (tab) => {
      for (const other of tabs) {
        const selected = other === tab;
        other.setAttribute('aria-selected', String(selected));
        other.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(other.getAttribute('aria-controls') ?? '');
        if (panel) panel.hidden = !selected;
      }
    };
    for (const tab of tabs) {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        const rtl = getComputedStyle(list).direction === 'rtl' ? -1 : 1;
        const next = tabs[(tabs.indexOf(tab) + step * rtl + tabs.length) % tabs.length];
        next.focus();
        select(next);
      });
    }
  }
}

/** The canonical URL of a site page (for share text). */
export const siteUrl = (path = '') => new URL(path, SITE).href;
