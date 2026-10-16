# Content Security Policy

location-picker is built to run under a strict Content Security Policy:

- **Its own CSS needs no `style-src` entry.** The element adopts one constructed stylesheet into its shadow root, and the class adopts one into its target's document (or shadow root). Neither uses `style=""` attributes or inline `<style>` (except the fallback described below).
- **Everything it inserts carries your nonce**: the Leaflet `<script>` and `<link>`, Google's bootstrap, and the fallback `<style>`. The nonce comes from the `nonce` attribute or option, or by default from the first `script[nonce]` in the document.
- **It loads nothing you did not ask for.** By default that is Leaflet from jsDelivr (only when `window.L` is absent) and the OpenStreetMap tiles. Search and reverse geocoding add Photon. MapLibre and its CSS are never fetched unless you set a URL.

## Recipes

| Setup                                                                           | `script-src`                                                 | `style-src`                                                                                      | `img-src`                                              | `connect-src`                   | Other                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------- | -------------------------------------- |
| Default: Leaflet auto-load + OSM                                                | `https://cdn.jsdelivr.net` (or `'nonce-…' 'strict-dynamic'`) | `https://cdn.jsdelivr.net`                                                                       | `https://tile.openstreetmap.org`                       | –                               | –                                      |
| + `search` / `reverse-geocode` (Photon)                                         | as above                                                     | as above                                                                                         | as above                                               | `https://photon.komoot.io`      | –                                      |
| Self-hosted engine (`engine-url="/vendor/leaflet/leaflet.js"`) or a bundled `L` | `'self'`                                                     | `'self'`                                                                                         | your tile host                                         | your Photon host                | –                                      |
| MapLibre (bundled) + OpenFreeMap                                                | `'self'`                                                     | `'self'` (or jsDelivr, only if you set `engine-css-url` to it)                                   | `'self' data: blob:`                                   | `https://tiles.openfreemap.org` | `worker-src blob:` (MapLibre's worker) |
| Google                                                                          | per Google's guide (nonce + `'strict-dynamic'`)              | Google injects `<style>` into the page and into the element's shadow root: follow Google's guide | `https://*.googleapis.com https://*.gstatic.com data:` | `https://*.googleapis.com`      | follow Google's guide for fonts        |
| Class mode where `adoptedStyleSheets` is unavailable                            | –                                                            | `'nonce-…'` (the fallback `<style nonce>`), or `injectStyles: false` + `style.css`               | –                                                      | –                               | –                                      |

If you load location-picker itself from jsDelivr (`https://cdn.jsdelivr.net/npm/location-picker@3`), that is already covered by the `script-src` entry of the default row. Self-hosting the script build means `'self'`.

## Examples

The default setup, with search, loading everything from jsDelivr:

```text
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' https://tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io
```

The same with a nonce instead of host allowlists (`RANDOM` is a fresh value per response, also set on your own `<script nonce="RANDOM">` tags):

```text
Content-Security-Policy: script-src 'nonce-RANDOM' 'strict-dynamic'; style-src 'self' https://cdn.jsdelivr.net; img-src 'self' https://tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io; object-src 'none'; base-uri 'none'
```

Everything self-hosted, with your own tiles and Photon:

```text
Content-Security-Policy: default-src 'self'; img-src 'self' https://tiles.example.com; connect-src 'self' https://photon.example.org
```

<!-- prettier-ignore-start -->
<!-- doctest:skip "needs your own /vendor/leaflet files and tile server" -->
```html
<location-picker
  name="location"
  search
  engine-url="/vendor/leaflet/leaflet.js"
  engine-css-url="/vendor/leaflet/leaflet.css"
  tile-url="https://tiles.example.com/{z}/{x}/{y}.png"
  attribution="&copy; OpenStreetMap contributors"
></location-picker>
```
<!-- prettier-ignore-end -->

With a bundler, pass the engine and import Leaflet's CSS yourself; nothing is fetched from a CDN (see the [JavaScript class example](../README.md#javascript-class)).

## Class mode and `style.css`

The class adopts its stylesheet into the target's root node. Where constructable stylesheets are unavailable it falls back to a `<style>` element that carries the nonce. To add no styles at runtime at all, turn injection off and import the stylesheet from your bundle:

```ts
import 'location-picker/style.css';
import { LocationPicker } from 'location-picker/core';

new LocationPicker('#map', { injectStyles: false });
```

`location-picker/style.css` also contains a placeholder rule that reserves 320px for `<location-picker>` before the script runs, which avoids layout shift.

## Google Maps

Google's Maps JavaScript API has its own requirements, which change over time. Follow Google's [Content Security Policy guide](https://developers.google.com/maps/documentation/javascript/content-security-policy) (a nonce with `'strict-dynamic'`). The picker puts your nonce on the bootstrap script it injects, so Google's loader picks it up.

## Trusted Types

The engine auto-loader does not support `require-trusted-types-for 'script'` in 3.0. Load the engine yourself (a bundled `L` or your own `<script>`) and set `engine-url="none"`.
