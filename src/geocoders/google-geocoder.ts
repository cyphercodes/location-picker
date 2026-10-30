/// <reference types="google.maps" />
// google.maps.Geocoder, the Google adapter's paired geocoder (CONTRACT §4.4, §5.1). It needs the Geocoding API and
// makes no request unless reverse geocoding is on or geocode()/lookupAddress() is called. Failures reject with the
// engine's own errors, which the core reports as GEOCODER_FAILED.
import type { GeocodeResult, Geocoder } from '../core.js';
import { mapsGlobal } from '../providers/google-bootstrap.js';

type Request = google.maps.GeocoderRequest;

function toResult(result: google.maps.GeocoderResult): GeocodeResult {
  const { location, viewport } = result.geometry;
  const address = result.formatted_address;
  const [northEast, southWest] = [viewport.getNorthEast(), viewport.getSouthWest()];
  return {
    lat: location.lat(),
    lng: location.lng(),
    label: address,
    address,
    bounds: {
      north: northEast.lat(),
      east: northEast.lng(),
      south: southWest.lat(),
      west: southWest.lng(),
    },
    ...(result.place_id && { id: result.place_id }),
    raw: result,
  };
}

/** google.maps.Geocoder for reverse lookups and `geocode()` (Geocoding API). `pairsWith: ['google']`. */
export function googleGeocoder(options: { region?: string; language?: string } = {}): Geocoder {
  let engine: Promise<google.maps.Geocoder> | undefined;
  // Created on first use, from the namespace or the geocoding library (pages that load through importLibrary).
  const geocoder = (): Promise<google.maps.Geocoder> =>
    (engine ??= (async () => {
      const maps = mapsGlobal();
      const Geocoder =
        maps?.Geocoder ?? (maps?.importLibrary && (await maps.importLibrary('geocoding')).Geocoder);
      if (!Geocoder) {
        engine = undefined;
        throw new Error('google.maps.Geocoder is not loaded');
      }
      return new Geocoder();
    })());

  const run = async (
    request: Request,
    lang: string,
    signal: AbortSignal,
  ): Promise<GeocodeResult[]> => {
    const google = await geocoder();
    signal.throwIfAborted();
    try {
      const { results } = await google.geocode({
        ...request,
        language: options.language ?? lang,
        ...(options.region && { region: options.region }),
      });
      signal.throwIfAborted();
      return results.map(toResult);
    } catch (cause) {
      // The promise form rejects ZERO_RESULTS, which is an empty answer, not a failure.
      if (Reflect.get(Object(cause), 'code') === 'ZERO_RESULTS') return [];
      throw cause;
    }
  };

  return {
    pairsWith: ['google'],
    search: async (query, { signal, lang, limit }) =>
      (await run({ address: query }, lang, signal)).slice(0, limit),
    reverse: async (at, { signal, lang }) => (await run({ location: at }, lang, signal))[0] ?? null,
  };
}
