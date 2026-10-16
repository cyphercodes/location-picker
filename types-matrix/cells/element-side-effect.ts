// `import 'location-picker/element'` alone types the tag (HTMLElementTagNameMap) and the element's accessors.
import 'location-picker/element';

const el = document.createElement('location-picker');
el.value = '48.8584, 2.2945';
el.locate = 'button';
el.locate = '';
el.locate = true;
const located = el.locate();
el.form = 'f1';
const owner: HTMLFormElement | null = el.form;
el.geolocation = { timeout: 5000 };
el.required = true;
el.addEventListener('change', (event) => event.detail.lat.toFixed(5));
el.addEventListener('addresschange', (event) => event.detail.address);
const found = document.querySelector('location-picker');
// @ts-expect-error locate modes are 'off' | 'button' | 'auto'
el.locate = 'sometimes';
export const used = [located, owner, found?.valueAsLatLng, el.validity.valueMissing];
