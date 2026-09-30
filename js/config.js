/*
  CT Food Access Finder configuration.
  For the live Google map, replace the empty string with a browser-restricted
  Google Maps Platform API key that has Maps JavaScript API, Places API, and Routes API enabled.
  The current Routes Library is used for both route drawing and route-aware ranking.
*/
window.CT_FOOD_ACCESS_CONFIG = {
  GOOGLE_MAPS_API_KEY: "",
  SNAP_SEARCH_RADIUS_MILES: 10,
  MAX_SNAP_RESULTS: 40,
  MAX_GOOGLE_ENRICHMENTS: 8,
  DEFAULT_CENTER: { lat: 41.7658, lng: -72.6734 } // Hartford, CT fallback for demo use
};
