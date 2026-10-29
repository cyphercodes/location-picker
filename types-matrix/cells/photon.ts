// location-picker/photon: the keyless geocoder.
import { LocationPicker, type Geocoder } from 'location-picker/core';
import { PHOTON_URL, formatPhotonAddress, photonGeocoder } from 'location-picker/photon';

const geocoder: Geocoder = photonGeocoder({ url: PHOTON_URL, lang: 'fr', limit: 5 });
const label: string = formatPhotonAddress({ name: 'Tour Eiffel', city: 'Paris' });
const picker = new LocationPicker('#map', { search: true, reverseGeocode: true, geocoder });
export const used = [label, picker.address];
