import MapOptions = google.maps.MapOptions
import Map = google.maps.Map

import './location-picker.css'

export default class LocationPicker {
  element: HTMLElement | null
  map: Map

  constructor(elementId: string, options: LocationPickerOptions, mapOptions: MapOptions) {
    let mO: MapOptions = {
      center: new google.maps.LatLng(34.4346, 35.8362),
      zoom: 15
    }

    let pO: LocationPickerOptions = {
      setCurrentPosition: true
    }

    Object.assign(mO, mapOptions)
    Object.assign(pO, options)

    this.element = document.getElementById(elementId)
    this.map = new google.maps.Map(this.element, mO)

    // Append CSS centered marker element
    let node = document.createElement('div')
    node.classList.add('centerMarker')

    if (this.element) {
      this.element.classList.add('location-picker')
      this.element.children[0].appendChild(node)
    }

    if (pO.setCurrentPosition) {
      this.setCurrentPosition()
    }
  }

  setCurrentPosition() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        position => {
          let pos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }
          this.map.setCenter(pos)
        },
        () => {
          console.log('Could not determine your location...')
        }
      )
    } else {
      console.log('Your browser does not support Geolocation.')
    }
  }

  getMarkerPosition() {
    const latLng = this.map.getCenter()
    return { lat: latLng.lat(), lng: latLng.lng() }
  }
}

export interface LocationPickerOptions {
  setCurrentPosition: boolean
}
