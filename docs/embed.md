# No-code embed

You can add a map location field to a site builder or a hosted form without writing code. The [snippet generator](https://cyphercodes.github.io/location-picker/embed/) asks a few questions (the map, what the form should receive, the language, inline map or phone field) and gives you one block to paste, with a live preview. This page explains where to paste it on each platform, and where it cannot work.

Every snippet loads `https://cdn.jsdelivr.net/npm/location-picker@3`. Keep the `@3`: it pins the major version, so a future major release never changes your page. The unpinned `/dist/location-picker.min.js` URL is the old v1 file.

## What the form receives

The picker joins the form it sits in, like any input. Choose one of these in the generator:

| Choice                          | Attributes                                      | The form receives                                      |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| One field                       | `name="location"`                               | `location=48.85837,2.294481` (latitude first)          |
| Separate latitude and longitude | `lat-name="lat" lng-name="lng"`                 | `lat=48.85837` and `lng=2.294481`                      |
| Hidden inputs                   | `lat-input`, `lng-input` pointing at `<input>`s | whatever those inputs are named; the picker fills them |
| An address too                  | `address-name="address"` (or `address-input`)   | the street address found for the point                 |

Choose **hidden inputs** when the platform only collects real `<input>` elements (Webflow, Netlify Forms, Shopify, most WordPress form plugins). The picker writes the coordinates into them and fires their native `input` and `change` events.

For a form that people fill in on phones (delivery, pickup, sign-up), choose **Automatic** under Presentation (`presentation="auto"`): on a phone the picker is a compact field with a **Choose on map** button that opens the map full screen, and on a desktop it is the inline map. See [field mode](../README.md#phone-first-field-mode).

A minimal snippet (OpenStreetMap, one field, search and a required check):

```html
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<label for="location-field">Location</label>
<location-picker
  id="location-field"
  name="location"
  search
  required
  style="height: 360px"
></location-picker>
```

## Plain HTML forms

Tick **Include a complete form** in the generator and set the form's action. Form services such as [Formspree](https://formspree.io/) and [Basin](https://usebasin.com/) accept any field names, so one `location` field or `lat` and `lng` both work.

<!-- prettier-ignore-start -->
<!-- doctest:skip "posts to a third-party form service, which the doc tests cannot reach" -->
```html
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<form method="post" action="https://formspree.io/f/YOUR_FORM_ID">
  <label for="location-field">Meeting point</label>
  <location-picker id="location-field" lat-name="lat" lng-name="lng" search locate="button" required style="height: 360px"></location-picker>
  <button type="submit">Send</button>
</form>
```
<!-- prettier-ignore-end -->

[Netlify Forms](https://docs.netlify.com/forms/setup/) registers the fields it finds in your HTML when the site is deployed, so it never sees fields that a script adds later. Choose **hidden inputs** so the fields are in the HTML, and add `data-netlify="true"` and a `name` to the form:

```html
<form name="delivery" method="post" action="/thanks/" data-netlify="true">
  <label for="location-field">Delivery spot</label>
  <location-picker
    id="location-field"
    presentation="auto"
    lat-input="location-field-lat"
    lng-input="location-field-lng"
    search
    locate="button"
    required
  >
    <input type="hidden" id="location-field-lat" name="lat" />
    <input type="hidden" id="location-field-lng" name="lng" />
  </location-picker>
  <button type="submit">Send</button>
</form>
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
```

## WordPress

Add a **Custom HTML** block and paste the snippet. WordPress keeps `<script>` tags in that block only for users with the `unfiltered_html` capability (administrators on a self-hosted site); other roles and some hosted plans strip them.

Form plugins submit only the fields they define, so a picker next to a plugin form is not submitted with it. Instead:

1. Add hidden fields for the latitude and longitude in the plugin. In Contact Form 7, put `[hidden lat]` and `[hidden lng]` in the form template; they render `<input type="hidden" name="lat">` and `name="lng"`. Other plugins name their inputs differently: inspect the page to find the `name` or `id` of each hidden input.
2. In the generator choose **Hidden inputs** and tick **My form already has these fields**. The snippet then points `lat-input` and `lng-input` at those inputs with CSS selectors:

```html
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<label for="location-field">Location</label>
<location-picker
  id="location-field"
  lat-input="[name='lat']"
  lng-input="[name='lng']"
  search
  required
  style="height: 360px"
></location-picker>
```

Without a form plugin, use a complete form posting to a form service (see [plain HTML forms](#plain-html-forms)).

## Webflow

Put a **Code Embed** element inside your **Form Block** and paste the snippet. Webflow's form handler only collects real inputs, so choose **Hidden inputs** in the generator: the snippet then carries its own hidden `<input>`s, named as you chose, inside the embed. Custom code needs a Webflow plan that allows it.

## Squarespace

The built-in Form Block cannot take extra fields. Add a **Code Block** instead and paste a snippet with **Include a complete form** ticked, posting to Formspree, Basin or your own endpoint (see [plain HTML forms](#plain-html-forms)). JavaScript in Code Blocks needs a Squarespace plan that allows it.

## Shopify

To save a delivery or pickup spot with an order line, add a **Custom Liquid** block to the product page and use hidden inputs named as line item properties, such as `properties[Delivery location]`. The inputs must sit inside the product form, or carry its `form="…"` id. That id depends on the theme; in Dawn-based themes it is `product-form-{{ section.id }}`.

<!-- prettier-ignore-start -->
<!-- doctest:skip "Shopify Liquid; it needs a Shopify theme to render" -->
```liquid
<script src="https://cdn.jsdelivr.net/npm/location-picker@3"></script>
<label for="delivery-spot">Delivery spot</label>
<location-picker id="delivery-spot" presentation="auto" value-input="delivery-spot-value" search locate="button">
  <input type="hidden" id="delivery-spot-value" name="properties[Delivery location]" form="product-form-{{ section.id }}">
</location-picker>
```
<!-- prettier-ignore-end -->

The order then shows `Delivery location: 48.85837,2.294481`. Shopify's checkout does not run custom scripts, so the picker cannot be added to the checkout pages themselves.

## Where it cannot work

- **Google Forms** and **Microsoft Forms** have no custom fields and run no scripts. Ask for coordinates as text instead, or send people the [pick link](ai-agents.md#ask-a-person-for-a-location-the-pick-link) and have them paste the result.
- **Wix** runs HTML embeds inside an iframe, so the picker cannot join a Wix form. A complete form inside the same embed, posting to Formspree or Basin, does work. The "Use my location" button may be blocked inside that iframe.
- **Any iframe-based embed** has the same limit: an element inside an iframe cannot add fields to a form outside it.

## Before you go live

- **Maps and search have usage policies.** The default OpenStreetMap tiles and the Photon search are free, best-effort services for light use. A busy site should use its own or a commercial tile server and geocoder: see [providers](providers.md).
- **Google Maps** needs a browser key restricted by HTTP referrer, with the Maps JavaScript API and Places API (New) enabled, and is billed by Google. Paste it into the generator's key field; the generator itself stores nothing.
- **Content Security Policy:** if your platform lets you set one, see [csp.md](csp.md).
- **Validate on the server too:** latitude in [-90, 90], longitude in [-180, 180].
