// CONTRACT §12.6 Photon mock (WP3): canned Photon GeoJSON for /api?q= and /reverse?lat=&lon=. Pure (no DOM, Node or
// vitest imports), so the route table (Node), jsdom tests and in-page fetch stubs can all use it.
import type * as C from '../../src/internal/contracts.js';

interface Place {
  /** Lower-case query key: a query matches when it contains the key or is a prefix of it. */
  readonly key: string;
  readonly lat: number;
  readonly lng: number;
  readonly properties: Record<string, unknown>;
}

const PLACES: readonly Place[] = [
  {
    key: 'eiffel',
    lat: 48.8582602,
    lng: 2.2944813,
    properties: {
      osm_type: 'W',
      osm_id: 5013364,
      type: 'house',
      name: 'Tour Eiffel',
      housenumber: '5',
      street: 'Avenue Anatole France',
      postcode: '75007',
      city: 'Paris',
      country: 'France',
      countrycode: 'FR',
      extent: [2.2933084, 48.8590465, 2.2956897, 48.8574753],
    },
  },
  {
    key: 'beirut',
    lat: 33.8959203,
    lng: 35.47843,
    properties: {
      osm_type: 'R',
      osm_id: 6261353,
      type: 'city',
      name: 'Beirut',
      country: 'Lebanon',
      countrycode: 'LB',
      extent: [35.4683, 33.9147, 35.5517, 33.8597],
    },
  },
  {
    key: 'tripoli',
    lat: 34.4367,
    lng: 35.8497,
    properties: {
      osm_type: 'N',
      osm_id: 268194543,
      type: 'city',
      name: 'Tripoli',
      postcode: '1300',
      country: 'Lebanon',
      countrycode: 'LB',
    },
  },
  {
    key: 'tripoli',
    lat: 32.896672,
    lng: 13.1777923,
    properties: {
      osm_type: 'N',
      osm_id: 30158389,
      type: 'city',
      name: 'Tripoli',
      country: 'Libya',
      countrycode: 'LY',
    },
  },
  {
    key: 'sydney',
    lat: -33.8698439,
    lng: 151.2082848,
    properties: {
      osm_type: 'R',
      osm_id: 5750005,
      type: 'city',
      name: 'Sydney',
      state: 'New South Wales',
      country: 'Australia',
      countrycode: 'AU',
      extent: [150.5209286, -33.3640743, 151.3430209, -34.1732387],
    },
  },
];

/** Queries the mock answers: one per canned place, an empty result, and a server error. */
export const PHOTON_QUERIES: readonly string[] = [
  'Eiffel Tower',
  'Beirut',
  'Tripoli',
  'Sydney',
  'nowhere at all',
  'error',
];

const feature = (place: Place) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
  properties: place.properties,
});
const json = (features: readonly Place[]): Response =>
  Response.json({ type: 'FeatureCollection', features: features.map(feature) });

/** Canned Photon GeoJSON for /api?q= and /reverse?lat=&lon= (Eiffel Tower, Beirut, Tripoli, Sydney, an empty result, an error). */
export function photonResponse(url: URL): Response | null {
  const params = url.searchParams;
  const limit = Number(params.get('limit') ?? 5);
  // Self-hosted Photon often lives under a prefix (https://geo.example.org/photon/api).
  const path = url.pathname.replace(/\/$/, '');
  if (path.endsWith('/api')) {
    const q = (params.get('q') ?? '').trim().toLowerCase();
    if (q == 'error') return new Response('{"message":"internal error"}', { status: 500 });
    return json(PLACES.filter((p) => q.includes(p.key) || p.key.startsWith(q)).slice(0, limit));
  }
  if (path.endsWith('/reverse')) {
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response('{"message":"missing lat/lon"}', { status: 400 });
    }
    // The nearest canned place within half a degree, like a reverse lookup that finds something nearby.
    const near = PLACES.map((p) => ({ p, d: Math.hypot(p.lat - lat, p.lng - lng) }))
      .filter(({ d }) => d < 0.5)
      .sort((a, b) => a.d - b.d)
      .map(({ p }) => p);
    return json(near.slice(0, limit));
  }
  return null;
}

photonResponse satisfies typeof C.photonResponse;
PHOTON_QUERIES satisfies typeof C.PHOTON_QUERIES;
