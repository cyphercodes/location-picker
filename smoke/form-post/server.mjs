// A Laravel-style edit form served by Express (WP5-12 form-post): the README's Blade markup rendered with the stored
// values, a CSRF token and a PUT method field, and a handler that checks the token and echoes what it received.
// GET /stores/1/edit   bound inputs inside the element (the recommended pattern)
// GET /legacy          hidden inputs outside the element (lat-input/lng-input, the most common pattern in the wild)
import express from 'express';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const TOKEN = 'smoke-csrf-token';
const store = { lat: '48.8584', lng: '2.2945' };
const dist =
  dirname(createRequire(import.meta.url).resolve('location-picker/package.json')) + '/dist';

const app = express();
app.use('/vendor/location-picker', express.static(dist));
app.use(express.urlencoded({ extended: false }));

const page = (title, form) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body>
  ${form}
  <script src="/vendor/location-picker/location-picker.global.js"></script>
</body>
</html>`;

app.get('/', (_req, res) => res.redirect('/stores/1/edit'));

app.get('/stores/1/edit', (_req, res) => {
  res.send(
    page(
      'Edit store',
      `<form method="POST" action="/stores/1">
    <input type="hidden" name="_token" value="${TOKEN}">
    <input type="hidden" name="_method" value="PUT">
    <label for="store-location">Store location</label>
    <location-picker id="store-location" lat-input="lat" lng-input="lng" address-name="address"
                     required search reverse-geocode style="height: 360px">
      <input id="lat" name="lat" inputmode="decimal" value="${store.lat}" aria-label="Latitude">
      <input id="lng" name="lng" inputmode="decimal" value="${store.lng}" aria-label="Longitude">
    </location-picker>
    <button type="submit">Save</button>
  </form>`,
    ),
  );
});

app.get('/legacy', (_req, res) => {
  res.send(
    page(
      'Legacy form',
      `<form method="POST" action="/stores/1">
    <input type="hidden" name="_token" value="${TOKEN}">
    <input type="hidden" name="_method" value="PUT">
    <input type="hidden" name="lat" id="lat" value="${store.lat}">
    <input type="hidden" name="lng" id="lng" value="${store.lng}">
    <location-picker id="store-location" lat-input="lat" lng-input="lng" style="height: 360px"></location-picker>
    <button type="submit">Save</button>
  </form>`,
    ),
  );
});

// Laravel answers 419 to a missing or wrong CSRF token and reads the method from _method.
app.post('/stores/1', (req, res) => {
  if (req.body._token !== TOKEN) return res.status(419).json({ error: 'CSRF token mismatch' });
  res.json({ method: req.body._method ?? 'POST', fields: req.body });
});

const port = Number(process.env.PORT ?? 4300);
app.listen(port, '127.0.0.1', () => console.log(`form-post smoke on http://127.0.0.1:${port}/`));
