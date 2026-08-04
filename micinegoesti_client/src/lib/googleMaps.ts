import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

export type GoogleMapsLibraries = {
  Map: typeof google.maps.Map;
  AdvancedMarkerElement: typeof google.maps.marker.AdvancedMarkerElement;
  PinElement: typeof google.maps.marker.PinElement;
  Geocoder: typeof google.maps.Geocoder;
};

export type GoogleRoutesLibrary = {
  Route: typeof google.maps.routes.Route;
};

let googleMapsLibrariesPromise: Promise<GoogleMapsLibraries> | null = null;
let googleRoutesLibraryPromise: Promise<GoogleRoutesLibrary> | null = null;

export function configuredGoogleMapsMapId() {
  return import.meta.env.VITE_GOOGLE_MAPS_MAP_ID?.trim() || "DEMO_MAP_ID";
}

export function loadGoogleMaps() {
  const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";
  const googleMapsMapId = configuredGoogleMapsMapId();
  if (!googleMapsApiKey) {
    return Promise.reject(new Error("Google Maps nu este configurat."));
  }

  if (!googleMapsLibrariesPromise) {
    googleMapsLibrariesPromise = (async () => {
      setOptions({
        key: googleMapsApiKey,
        v: "weekly",
        language: "ro",
        region: "RO",
        authReferrerPolicy: "origin",
        mapIds: [googleMapsMapId]
      });
      const [mapsLibrary, markerLibrary, geocodingLibrary] = await Promise.all([
        importLibrary("maps") as Promise<google.maps.MapsLibrary>,
        importLibrary("marker") as Promise<google.maps.MarkerLibrary>,
        importLibrary("geocoding") as Promise<google.maps.GeocodingLibrary>
      ]);

      return {
        Map: mapsLibrary.Map,
        AdvancedMarkerElement: markerLibrary.AdvancedMarkerElement,
        PinElement: markerLibrary.PinElement,
        Geocoder: geocodingLibrary.Geocoder
      };
    })().catch((error) => {
      googleMapsLibrariesPromise = null;
      throw error;
    });
  }

  return googleMapsLibrariesPromise;
}

export function loadGoogleRoutes() {
  if (!googleRoutesLibraryPromise) {
    googleRoutesLibraryPromise = loadGoogleMaps()
      .then(async () => {
        const routesLibrary = await importLibrary("routes") as google.maps.RoutesLibrary;
        return { Route: routesLibrary.Route };
      })
      .catch((error) => {
        googleRoutesLibraryPromise = null;
        throw error;
      });
  }

  return googleRoutesLibraryPromise;
}
