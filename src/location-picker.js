(function (window) {
    'use strict';

    function LocationPicker() {
        var self = {
            element: null,
            map: null,
        };

        // Set map center
        var centerOfMap = new google.maps.LatLng(34.4346, 35.8362);

        // Set default plugin options
        var defaultOptions = {
            setCurrentPosition: true
        };

        // Set default google map options
        var defaultMapOptions = {
            center: centerOfMap,
            zoom: 15
        };


        self.init = function (elementId, options, mapOptions) {

            // Set plugin options
            for (var attrname in options) {
                defaultOptions[attrname] = options[attrname];
            }

            // Set map options
            for (var attrname in mapOptions) {
                defaultMapOptions[attrname] = mapOptions[attrname];
            }

            // Get & set element reference
            self.element = document.getElementById(elementId);

            // Initialize & set map reference
            self.map = new google.maps.Map(self.element, defaultMapOptions);

            // Add class to the plugin element
            self.element.classList.add('location-picker');

            // Append CSS centered marker element
            var node = document.createElement("div");
            node.classList.add('centerMarker');
            self.element.appendChild(node);

            // Get & set current position if setCurrentPosition was set to true
            if (typeof(defaultOptions.setCurrentPosition) !== 'undefined' && defaultOptions.setCurrentPosition) {
                setCurrentPosition();
            }
            return self;
        };

        // Return the current marker position
        self.getMarkerPosition = function () {
            const latLng = self.map.getCenter();
            return {lat: latLng.lat(), lng: latLng.lng()};
        };


        // Get current location from browser and set map center to current location
        var setCurrentPosition = function () {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function (position) {
                    var pos = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    self.map.setCenter(pos);
                }, function () {
                    console.log('Could not determine your location...');
                });
            } else {
                console.log('Your browser does not support Geolocation.');
            }
        };


        return self;
    }

    if (typeof(window.LocationPicker) === 'undefined') {
        window.LocationPicker = LocationPicker();
    }
})(window);
