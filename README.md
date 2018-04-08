<h1 align="center" style="border-bottom: none; text-align: center">🗺🎯 location-picker</h1>

<h3 align="center" style="text-align: center">Efficiently allow your users to pick a location!</h3>

<p align="center" style="text-align: center">
  <a href="https://travis-ci.org/cyphercodes/location-picker">
    <img alt="Travis" src="https://img.shields.io/travis/cyphercodes/location-picker/master.svg">
  </a>
  <a href="https://github.com/ellerbrock/open-source-badges/">
    <img src="https://badges.frapsoft.com/os/v2/open-source.svg?v=103" alt="Open Source Love">
  </a>
  <a href="https://github.com/semantic-release/semantic-release">
    <img src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg" alt="semantic-release">
  </a>
   <a href="https://www.npmjs.com/package/location-picker">
      <img alt="npm latest version" src="https://img.shields.io/npm/v/location-picker.svg">
    </a>
</p>

**location-picker** allows you to quickly render Google Maps with an overlaying marker providing an easy and quick plug-and-play location picker. It uses Google Maps v3 and it works with all JavaScript flavors!

[LIVE DEMO](https://cyphercodes.github.io/location-picker/example/)

[DOCUMENTATION](https://cyphercodes.github.io/location-picker/docs/)

## Requirements

* Google Maps v3

## Installation

```
npm install location-picker --save
```

### Import libraries using HTML:

**From `node_modules`:**
```html
<script type="text/javascript" src="https://maps.googleapis.com/maps/api/js?key={ENTER YOUR KEY}"></script>
<script src="../node_modules/location-picker/dist/location-picker.min.js"></script>
```

**From CDN:**
```html
<script type="text/javascript" src="https://maps.googleapis.com/maps/api/js?key={ENTER YOUR KEY}"></script>
<script src="https://unpkg.com/location-picker/dist/location-picker.min.js"></script>
```

### Import using Typescript or Angular

```typescript
import LocationPicker from "location-picker";
```

### Import using CommonJS / Node:

```javascript
var locationPicker = require("location-picker")
```

## Usage

### Add element in HTML with a unique id:

```html
#map {
    width: 100%;
    height: 480px;
}
<div id="map"></div>
```

### Initialize the locationPicker plugin:

#### Plain JavaScript:
```javascript
var locationPicker = new locationPicker('map', {
    setCurrentPosition: true, // You can omit this, defaults to true
}, {
    zoom: 15 // You can set any google map options here, zoom defaults to 15
});
```

#### Angular:

```typescript
let lp = new LocationPicker('map',{
    setCurrentPosition: true, // You can omit this, defaults to true
}, {
    zoom: 15 // You can set any google map options here, zoom defaults to 15
});
```

## Methods

### locationPicker(elementId, pluginOptions, mapOptions)

Returns a reference to the locationPicker object

#### `element`: *`string`* | *`HTMLElement`* 
The ID of the HTML element you want to initialize the plugin on or a direct reference to the HTMLElement.

#### `pluginOptions`: 

Options specific for this plugin

* `lat`: latitude of initial needed position
* `lng`: longitude of initial needed position
* `setCurrentPosition`: specifies if you want the plugin to automatically try and detect and set the marker to the the current user's location. It has no effect if `lat` and `lng` are supplied. _(defaults to true)_


#### `mapOptions`:

You can set any specific google maps option here.

For a list of all the available options please visit: 

https://developers.google.com/maps/documentation/javascript/reference#MapOptions

### locationPicker.getMarkerPosition()

Returns an object that contains the lat and lng of the currently selected position.

## Properties

### locationPicker.element 

A reference to the element the plugin was initialized on.

### locationPicker.map

A reference to the Google Map object


## Examples

### HTML Full Example
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Example</title>
  <script type="text/javascript"
          src="https://maps.googleapis.com/maps/api/js?key={{ENTER YOUR KEY}}"></script>
  <script src="https://unpkg.com/location-picker/dist/location-picker.min.js"></script>
  <style type="text/css">
    #map {
      width: 100%;
      height: 480px;
    }
  </style>
</head>

<body>
<div id="map"></div>
<br>
<button id="confirmPosition">Confirm Position</button>
<br>
<p>On idle position: <span id="onIdlePositionView"></span></p>
<p>On click position: <span id="onClickPositionView"></span></p>
<script>
  // Get element references
  var confirmBtn = document.getElementById('confirmPosition');
  var onClickPositionView = document.getElementById('onClickPositionView');
  var onIdlePositionView = document.getElementById('onIdlePositionView');

  // Initialize locationPicker plugin
  var lp = new locationPicker('map', {
    setCurrentPosition: true, // You can omit this, defaults to true
  }, {
    zoom: 15 // You can set any google map options here, zoom defaults to 15
  });

  // Listen to button onclick event
  confirmBtn.onclick = function () {
    // Get current location and show it in HTML
    var location = lp.getMarkerPosition();
    onClickPositionView.innerHTML = 'The chosen location is ' + location.lat + ',' + location.lng;
  };

  // Listen to map idle event, listening to idle event more accurate than listening to ondrag event
  google.maps.event.addListener(lp.map, 'idle', function (event) {
    // Get current location and show it in HTML
    var location = lp.getMarkerPosition();
    onIdlePositionView.innerHTML = 'The chosen location is ' + location.lat + ',' + location.lng;
  });
</script>

</body>
</html>
```

### Angular Example

* Import Google maps:

One example could be adding in `index.html`:
```html
<script type="text/javascript" src="https://maps.googleapis.com/maps/api/js?key={{ENTER YOUR KEY}}"></script>
```

* Add map element and button in HTML:

```html
<div id="map"></div>
<button (click)="setLocation()">Submit Location</button>
```

* Add this CSS:

```css
#map {
    width: 100%;
    height: 480px;
}
```

* Component:

```typescript
import {Component} from '@angular/core';
import LocationPicker from "location-picker";

@Component({
  selector: 'page-location',
  templateUrl: 'location.html'
})
export class LocationPage implements OnInit {
   lp: LocationPicker;
   
   ngOnInit(){
     this.lp = new LocationPicker('map');
   }
   
   setLocation() {
      console.log(this.lp.getMarkerPosition());
   }
}
```
