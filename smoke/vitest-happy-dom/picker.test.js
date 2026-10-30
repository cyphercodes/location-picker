// WP5-12 (docs/frameworks.md "Component tests in jsdom or happy-dom"): a component that renders <location-picker>
// can be unit tested. The element runs inert there: no exception, one warning naming the missing API, and the value
// still round-trips.
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

const warn = vi.spyOn(console, 'warn');
const error = vi.spyOn(console, 'error');
await import('location-picker');

afterEach(cleanup);

function StoreField() {
  return createElement(
    'form',
    null,
    createElement('location-picker', { name: 'loc', value: '1,2', 'data-testid': 'picker' }),
  );
}

test('renders inert with one warning, and the value round-trips', () => {
  const { getByTestId } = render(createElement(StoreField));
  const picker = getByTestId('picker');
  expect(customElements.get('location-picker')).toBeTypeOf('function');
  expect(picker.value).toBe('1,2');
  picker.value = '3,4';
  expect(picker.value).toBe('3,4');

  const inert = warn.mock.calls.filter(([message]) => /runs inert/.test(String(message)));
  expect(inert, JSON.stringify(warn.mock.calls)).toHaveLength(1);
  expect(error.mock.calls).toEqual([]);
});
