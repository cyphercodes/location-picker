(function (window) {
    'use strict';

    function LocationPicker() {
        var self = {
            element: null,
            map: null,
            marker: false
        };

        var centerOfMap = new google.maps.LatLng(20.6737777, -103.4054536);

        var options = {
            center: centerOfMap,
            zoom: 15,
            // gestureHandling: 'auto'
        };


        self.init = function (elementId) {
            console.log(elementId);
            self.element = document.getElementById(elementId);
            self.map = new google.maps.Map(self.element, options);
            self.element.className += ' location-picker';
            var node = document.createElement("div");
            node.className = "centerMarker";
            self.element.appendChild(node);
            setMarker();
            return self;
        };

        var setMarker = function () {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function (position) {
                    var pos = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    self.map.setCenter(pos);
                    // if (self.marker === false) {
                    //     self.marker = new google.maps.Marker({
                    //         position: pos,
                    //         map: self.map,
                    //         draggable: true
                    //     });
                    //     // google.maps.event.addListener(marker, 'dragend', function (event) {
                    //     //     markerLocation();
                    //     // });
                    // } else {
                    //     self.marker.setPosition(pos);
                    // }
                    // markerLocation();
                }, function () {
                    // handleLocationError(true, infoWindow, map.getCenter());
                });
            } else {
                // Si el navegador no soprta la geolocalización
                // handleLocationError(false, infoWindow, map.getCenter());
            }
        }


        return self;
    }

    if (typeof(window.LocationPicker) === 'undefined') {
        window.LocationPicker = LocationPicker();
    }
})(window);
