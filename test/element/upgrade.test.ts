// WP4-07 property upgrade (unit project). This file must not define the element before the test creates its node.
import { afterEach, expect, it, vi } from 'vitest';
import { erased } from '../../src/core/providers.js';
import { defineLocationPicker } from '../../src/element/define.js';
import { LocationPickerElement } from '../../src/element/location-picker-element.js';
import { createFakeAdapter } from '../fixtures/fake-adapter.js';
import { flush, part, record, spyConsole, summary } from './helpers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

it('WP4-07 value, provider (an adapter), messages and disabled set before define are applied; no own data properties remain', async () => {
  spyConsole();
  const fake = createFakeAdapter();
  const el = document.createElement('location-picker');
  expect(el).not.toBeInstanceOf(LocationPickerElement);
  const props = {
    value: '48.8584, 2.2945',
    provider: erased(fake.adapter),
    messages: { confirm: 'Choose this spot' },
    disabled: true,
    locate: 'button',
    form: 'f1',
    center: '10,20',
  };
  Object.assign(el, props);
  el.setAttribute('value', '1,2');
  document.body.append(el);
  const log = record(el);

  defineLocationPicker();
  expect(el).toBeInstanceOf(LocationPickerElement);
  const upgraded = el as LocationPickerElement;
  for (const key of Object.keys(props)) expect(Object.hasOwn(upgraded, key), key).toBe(false);

  // A property set before upgrade wins over the value attribute (§3.3 precedence step 1).
  expect(upgraded.value).toBe('48.8584,2.2945');
  expect(upgraded.disabled).toBe(true);
  expect(upgraded.getAttribute('disabled')).toBe('');
  expect(upgraded.getAttribute('locate')).toBe('button');
  expect(upgraded.locate).toBeTypeOf('function');
  expect(upgraded.getAttribute('form')).toBe('f1');
  expect(upgraded.getAttribute('center')).toBe('10,20');
  expect(upgraded.messages).toEqual({ confirm: 'Choose this spot' });
  expect(part(upgraded, 'confirm-button').textContent).toBe('Choose this spot');
  await flush();
  expect(fake.mountCount).toBe(1);
  expect(upgraded.provider).toBe(fake.adapter);
  expect(fake.handle?.map.interactive).toBe('none');
  expect(fake.handle?.map.center).toEqual({ lat: 48.8584, lng: 2.2945 });
  expect(summary(log)).toEqual(['ready']);
});
