// docs/frameworks.md Angular recipe (WP5-12 angular, WP4-10): formControlName + ngDefaultControl on the element, with
// the server-rendered bound inputs inside it (the README's Blade pattern). The control must hold "lat,lng": the
// inputs' own events never reach the host. Saving posts the form's FormData to /echo.
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import 'location-picker';

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <form [formGroup]="form" (ngSubmit)="save($event)">
      <label for="loc">Store location</label>
      <location-picker
        id="loc"
        formControlName="location"
        ngDefaultControl
        name="location"
        lat-input="lat"
        lng-input="lng"
        zoom="15"
        required
        style="display: block; height: 320px"
      >
        <input id="lat" name="lat" inputmode="decimal" value="48.8584" aria-label="Latitude" />
        <input id="lng" name="lng" inputmode="decimal" value="2.2945" aria-label="Longitude" />
      </location-picker>
      <p>
        Control: <output id="state">{{ form.controls.location.value }}</output>
      </p>
      <button type="submit">Save</button>
    </form>
    <pre id="echo">{{ echo() }}</pre>
  `,
})
export class App {
  readonly form = new FormGroup({
    location: new FormControl('48.8584,2.2945', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly echo = signal('');

  async save(event: Event): Promise<void> {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const body = new URLSearchParams();
    for (const [key, value] of new FormData(form))
      if (typeof value === 'string') body.append(key, value);
    const response = await fetch('/echo', { method: 'POST', body });
    this.echo.set(await response.text());
  }
}
