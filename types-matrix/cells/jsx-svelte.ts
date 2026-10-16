// location-picker/jsx/svelte (WP4-18): Svelte 5 element props with typed lowercase handlers.
import type {} from 'location-picker/jsx/svelte';
import type { SvelteHTMLElements } from 'svelte/elements';

type Props = SvelteHTMLElements['location-picker'];

export const props: Props = {
  name: 'location',
  value: '48.8584,2.2945',
  locate: 'button',
  onchange: (event) => event.detail.value,
  onaddresschange: (event) => event.detail.address,
};
// @ts-expect-error locate modes are 'off' | 'button' | 'auto'
export const wrong: Props = { locate: 'sometimes' };
