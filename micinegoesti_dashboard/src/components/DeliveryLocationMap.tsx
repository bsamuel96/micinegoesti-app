import { Crosshair, MapPin, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { configuredGoogleMapsMapId, loadGoogleMaps, type GoogleMapsLibraries } from "../lib/googleMaps";

export type Coordinates = { lat: number; lng: number };

type Props = {
  value: Coordinates | null;
  storeLocation: Coordinates;
  onLocationChange: (coordinates: Coordinates) => void;
  onAddressResolved?: (address: string) => void;
  onAddressResolutionChange?: (resolving: boolean) => void;
};

function markerCoordinates(position: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined) {
  if (!position) return null;
  return {
    lat: typeof position.lat === "function" ? position.lat() : position.lat,
    lng: typeof position.lng === "function" ? position.lng() : position.lng
  };
}

export default function DeliveryLocationMap({
  value,
  storeLocation,
  onLocationChange,
  onAddressResolved,
  onAddressResolutionChange
}: Props) {
  const googleMapsMapId = configuredGoogleMapsMapId();
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const deliveryMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const storeMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markerLibraryRef = useRef<Pick<GoogleMapsLibraries, "AdvancedMarkerElement" | "PinElement"> | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const mapListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const addressRequestIdRef = useRef(0);
  const valueRef = useRef(value);
  const onLocationChangeRef = useRef(onLocationChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onAddressResolutionChangeRef = useRef(onAddressResolutionChange);
  const selectionHandlerRef = useRef<(coordinates: Coordinates, recenter?: boolean) => void>(() => undefined);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");
  const [locating, setLocating] = useState(false);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  valueRef.current = value;
  onLocationChangeRef.current = onLocationChange;
  onAddressResolvedRef.current = onAddressResolved;
  onAddressResolutionChangeRef.current = onAddressResolutionChange;

  function setAddressResolutionState(resolving: boolean) {
    setResolvingAddress(resolving);
    onAddressResolutionChangeRef.current?.(resolving);
  }

  function updateDeliveryMarker(coordinates: Coordinates) {
    const map = mapRef.current;
    const markerLibrary = markerLibraryRef.current;
    if (!map || !markerLibrary) return;

    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.position = coordinates;
      return;
    }

    const pin = new markerLibrary.PinElement({
      background: "#ed4c05",
      borderColor: "#9b2f00",
      glyphColor: "#ffffff",
      scale: 1.18
    });
    const marker = new markerLibrary.AdvancedMarkerElement({
      map,
      position: coordinates,
      title: "Locația de livrare — trage pinul pentru ajustare",
      gmpDraggable: true,
      zIndex: 2
    });
    marker.append(pin);
    marker.addListener("dragend", () => {
      const position = markerCoordinates(marker.position);
      if (position) selectionHandlerRef.current(position);
    });
    deliveryMarkerRef.current = marker;
  }

  async function resolveCompleteAddress(coordinates: Coordinates) {
    const requestId = ++addressRequestIdRef.current;
    setError("");
    setAddressResolutionState(true);

    try {
      let address = "";
      try {
        const response = await geocoderRef.current?.geocode({
          location: coordinates,
          language: "ro",
          region: "RO"
        });
        const preciseResult =
          response?.results.find((result) =>
            result.types.some((type) => ["street_address", "premise", "subpremise"].includes(type))
          ) ?? response?.results[0];
        address = preciseResult?.formatted_address?.trim() ?? "";
      } catch {
        // The existing server proxy remains a resilient fallback if Google's
        // client geocoder is temporarily unavailable.
        address = (await api.reverseGeocode(coordinates)).address.trim();
      }

      if (!address) {
        address = (await api.reverseGeocode(coordinates)).address.trim();
      }
      if (!address) throw new Error("Nu am găsit o adresă completă pentru pinul selectat.");
      if (requestId !== addressRequestIdRef.current) return;
      onAddressResolvedRef.current?.(address);
    } catch (caught) {
      if (requestId !== addressRequestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : "Nu am putut identifica adresa completă.");
    } finally {
      if (requestId === addressRequestIdRef.current) setAddressResolutionState(false);
    }
  }

  selectionHandlerRef.current = (coordinates, recenter = false) => {
    onLocationChangeRef.current(coordinates);
    updateDeliveryMarker(coordinates);
    if (recenter) {
      mapRef.current?.panTo(coordinates);
      mapRef.current?.setZoom(Math.max(mapRef.current.getZoom() ?? 16, 17));
    }
    void resolveCompleteAddress(coordinates);
  };

  useEffect(() => {
    let cancelled = false;
    setMapState("loading");
    setError("");

    void loadGoogleMaps()
      .then(({ Map, AdvancedMarkerElement, PinElement, Geocoder }) => {
        if (cancelled || !mapElementRef.current) return;
        markerLibraryRef.current = { AdvancedMarkerElement, PinElement };
        geocoderRef.current = new Geocoder();

        const map = new Map(mapElementRef.current, {
          center: valueRef.current ?? storeLocation,
          zoom: valueRef.current ? 17 : 14,
          mapId: googleMapsMapId,
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "cooperative"
        });
        mapRef.current = map;

        const storePin = new PinElement({
          background: "#2d241f",
          borderColor: "#ffffff",
          glyphColor: "#ffffff",
          glyphText: "M"
        });
        const storeMarker = new AdvancedMarkerElement({
          map,
          position: storeLocation,
          title: "Mici de Negoești",
          zIndex: 1
        });
        storeMarker.append(storePin);
        storeMarkerRef.current = storeMarker;

        mapListenersRef.current = [
          map.addListener("click", (event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            selectionHandlerRef.current({
              lat: event.latLng.lat(),
              lng: event.latLng.lng()
            });
          })
        ];

        if (valueRef.current) updateDeliveryMarker(valueRef.current);
        setMapState("ready");
      })
      .catch((caught) => {
        if (cancelled) return;
        setMapState("error");
        setError(caught instanceof Error ? caught.message : "Harta Google nu a putut fi încărcată.");
      });

    return () => {
      cancelled = true;
      addressRequestIdRef.current += 1;
      mapListenersRef.current.forEach((listener) => listener.remove());
      mapListenersRef.current = [];
      if (deliveryMarkerRef.current) deliveryMarkerRef.current.map = null;
      if (storeMarkerRef.current) storeMarkerRef.current.map = null;
      deliveryMarkerRef.current = null;
      storeMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [retryKey, storeLocation.lat, storeLocation.lng]);

  useEffect(() => {
    if (!value || mapState !== "ready") return;
    updateDeliveryMarker(value);
  }, [mapState, value?.lat, value?.lng]);

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocația nu este disponibilă pe acest dispozitiv.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        selectionHandlerRef.current(
          { lat: coords.latitude, lng: coords.longitude },
          true
        );
        setLocating(false);
      },
      () => {
        setError("Nu am putut accesa locația dispozitivului. Selectează manual pinul pe hartă.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  return (
    <div className="delivery-map-field">
      <div className="delivery-map-actions">
        <div>
          <p>Alege punctul exact de livrare</p>
          <span>Apasă pe hartă sau trage pinul până la intrarea corectă.</span>
        </div>
        <button type="button" className="secondary-button" onClick={locate} disabled={locating || mapState !== "ready"}>
          <Crosshair aria-hidden="true" />
          {locating ? "Se caută locația…" : "Folosește locația mea"}
        </button>
      </div>

      <div className="google-delivery-map-shell">
        <div
          ref={mapElementRef}
          className="delivery-map google-delivery-map"
          aria-label="Hartă Google pentru selectarea punctului de livrare"
        />
        {mapState === "loading" && (
          <div className="delivery-map-overlay" role="status">
            <span className="map-loading-spinner" aria-hidden="true" />
            Se încarcă Google Maps…
          </div>
        )}
        {mapState === "error" && (
          <div className="delivery-map-overlay is-error" role="alert">
            <MapPin aria-hidden="true" />
            <strong>Harta Google nu este disponibilă</strong>
            <span>{error}</span>
            <button type="button" className="secondary-button" onClick={() => setRetryKey((value) => value + 1)}>
              <RotateCw aria-hidden="true" />
              Reîncearcă
            </button>
          </div>
        )}
      </div>

      {mapState !== "error" && (
        <div className={`delivery-address-resolution${error ? " is-error" : value ? " is-selected" : ""}`} aria-live="polite">
          <MapPin aria-hidden="true" />
          <span>
            {error
              ? error
              : resolvingAddress
                ? "Se completează adresa exactă…"
                : value
                  ? "Pin selectat. Verifică adresa completată și adaugă blocul, scara sau interfonul dacă este necesar."
                  : "Selectează un punct pe hartă pentru completarea automată a adresei."}
          </span>
        </div>
      )}
    </div>
  );
}
