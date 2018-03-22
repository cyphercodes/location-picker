import MapOptions = google.maps.MapOptions
import Map = google.maps.Map

import './location-picker.css'
import LatLng = google.maps.LatLng

export default class LocationPicker {
  element: HTMLElement | null
  map: Map

  constructor(
    element: string | HTMLElement,
    options: LocationPickerOptions = {},
    mapOptions: MapOptions = {}
  ) {
    let pO: LocationPickerOptions = {
      setCurrentPosition: true
    }

    Object.assign(pO, options)

    let mO: MapOptions = {
      center: new google.maps.LatLng(pO.lat ? pO.lat : 34.4346, pO.lng ? pO.lng : 35.8362),
      zoom: 15
    }

    Object.assign(mO, mapOptions)

    // Allow both, a string with the element's id or a direct reference to the element
    if (element instanceof HTMLElement) {
      this.element = element
    } else {
      this.element = document.getElementById(element)
    }

    this.map = new google.maps.Map(this.element, mO)

    // Append CSS centered marker element
    let node = document.createElement('div')
    node.classList.add('centerMarker')

    if (this.element) {
      this.element.classList.add('location-picker')
      this.element.children[0].appendChild(node)
    }

    // Set center to current position if attribute `setCurrentPosition` is true and no initial position is set
    if (pO.setCurrentPosition && !pO.lat && !pO.lng) {
      this.setCurrentPosition()
    }
  }

  getMarkerPosition() {
    const latLng = this.map.getCenter()
    return { lat: latLng.lat(), lng: latLng.lng() }
  }

  setLocation(lat: number, lng: number) {
    this.map.setCenter(new google.maps.LatLng(lat, lng))
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
}

export interface LocationPickerOptions {
  setCurrentPosition?: boolean
  lat?: number
  lng?: number
}
