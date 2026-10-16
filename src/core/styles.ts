// Picker CSS adoption (CONTRACT §3.1, §4.8): one constructed sheet per document and kind, adopted once per root, with a
// `<style nonce>` fallback where adoptedStyleSheets is missing (jsdom, old engines) or refuses the sheet.
import type * as C from '../internal/contracts.js';
import classCss from '../styles/class.css?inline';
import elementCss from '../styles/element.css?inline';
import { getStore } from './store.js';
import { version } from './version.js';

/** Sheets for documents other than this realm's own (iframes): a constructed sheet only adopts into its own document. */
const foreign = new WeakMap<Document, Map<string, CSSStyleSheet>>();

const isDocument = (root: Document | ShadowRoot): root is Document => root.nodeType == 9;
export const docOf = (root: Document | ShadowRoot): Document =>
  isDocument(root) ? root : root.ownerDocument;

/** `<style>` fallback: in document.head for a Document, else inside the ShadowRoot. Deduped by `key`. */
function styleElement(root: Document | ShadowRoot, key: string, css: string, nonce?: string): void {
  const parent = isDocument(root) ? root.head : root;
  if (
    [...parent.querySelectorAll('style[data-location-picker]')].some(
      (s) => s.getAttribute('data-location-picker') == key,
    )
  )
    return;
  const style = docOf(root).createElement('style');
  style.setAttribute('data-location-picker', key);
  if (nonce) style.nonce = nonce;
  style.textContent = css;
  parent.append(style);
}

/**
 * Adds `css` to `root` once (per `key`): a constructed sheet in adoptedStyleSheets, cached per document (in the global
 * store for this realm's document, so every library copy shares it), else a `<style nonce>`.
 */
export function adoptCss(
  root: Document | ShadowRoot,
  key: string,
  css: string,
  nonce?: string,
): void {
  const doc = docOf(root);
  const Sheet = doc.defaultView?.CSSStyleSheet;
  try {
    if (Sheet && Array.isArray(root.adoptedStyleSheets) && 'replaceSync' in Sheet.prototype) {
      const sheets =
        doc === globalThis.document
          ? getStore().sheets
          : (foreign.get(doc) ?? new Map<string, CSSStyleSheet>());
      foreign.set(doc, sheets);
      let sheet = sheets.get(key);
      if (!sheet) {
        sheet = new Sheet();
        sheet.replaceSync(css);
        sheets.set(key, sheet);
      }
      if (!root.adoptedStyleSheets.includes(sheet))
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    }
  } catch {
    // A sheet from another realm or a refusing engine: fall back to <style>.
  }
  styleElement(root, key, css, nonce);
}

/** Adopt the picker sheet ('element' into a ShadowRoot, 'class' into a Document/ShadowRoot); fallback <style nonce>. Idempotent per root. */
export function adoptStyles(
  root: Document | ShadowRoot,
  which: 'element' | 'class',
  nonce?: string,
): void {
  adoptCss(root, `${version}:${which}`, which == 'class' ? classCss : elementCss, nonce);
}

adoptStyles satisfies typeof C.adoptStyles;
