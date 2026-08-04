import { Clock3, MapPin, Maximize2, Minimize2, Route as RouteIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  configuredGoogleMapsMapId,
  loadGoogleMaps,
  loadGoogleRoutes,
  type GoogleMapsLibraries
} from "../lib/googleMaps";

type Coordinates = { lat: number; lng: number };

type Props = {
  destination: Coordinates;
  courierLocation?: Coordinates | null;
  compact?: boolean;
  label?: string;
  showRoute?: boolean;
  allowFullscreen?: boolean;
};

type RouteSummary = {
  distanceMeters: number;
  durationMillis: number | null;
};

const ROUTE_RECALCULATION_DISTANCE_KM = 0.035;

function coordinateDistanceKm(from: Coordinates, to: Coordinates) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function distanceLabel(distanceMeters: number) {
  return distanceMeters < 1000
    ? `${Math.max(10, Math.round(distanceMeters / 10) * 10)} m`
    : `${(distanceMeters / 1000).toFixed(1)} km`;
}

function durationLabel(durationMillis: number | null) {
  if (durationMillis == null) return null;
  const minutes = Math.max(1, Math.round(durationMillis / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function LiveDeliveryMap({
  destination,
  courierLocation = null,
  compact = false,
  label = "Hartă live a livrării",
  showRoute = true,
  allowFullscreen = false
}: Props) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const destinationMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const courierMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const markerLibraryRef = useRef<Pick<GoogleMapsLibraries, "AdvancedMarkerElement" | "PinElement"> | null>(null);
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const routeViewportRef = useRef<google.maps.LatLngBounds | null>(null);
  const lastRoutedOriginRef = useRef<Coordinates | null>(null);
  const lastCourierPositionRef = useRef<Coordinates | null>(courierLocation);
  const routeRequestRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [routeState, setRouteState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setRouteState("idle");
    setRouteSummary(null);
    lastRoutedOriginRef.current = null;
    lastCourierPositionRef.current = courierLocation;

    void loadGoogleMaps()
      .then(({ Map, AdvancedMarkerElement, PinElement }) => {
        if (cancelled || !elementRef.current) return;
        markerLibraryRef.current = { AdvancedMarkerElement, PinElement };
        const map = new Map(elementRef.current, {
          center: courierLocation ?? destination,
          zoom: courierLocation ? 15 : 17,
          mapId: configuredGoogleMapsMapId(),
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "cooperative"
        });
        mapRef.current = map;

        const destinationPin = new PinElement({
          background: "#c52b1c",
          borderColor: "#7f0d19",
          glyphColor: "#ffffff",
          glyphText: "A",
          scale: 1.08
        });
        const destinationMarker = new AdvancedMarkerElement({
          map,
          position: destination,
          title: "Adresa clientului",
          zIndex: 2
        });
        destinationMarker.append(destinationPin);
        destinationMarkerRef.current = destinationMarker;

        if (courierLocation) {
          const courierPin = new PinElement({
            background: "#1769d2",
            borderColor: "#0f478d",
            glyphColor: "#ffffff",
            glyphText: "C",
            scale: 1.08
          });
          const courierMarker = new AdvancedMarkerElement({
            map,
            position: courierLocation,
            title: "Poziția curierului",
            zIndex: 3
          });
          courierMarker.append(courierPin);
          courierMarkerRef.current = courierMarker;
          const bounds = new google.maps.LatLngBounds();
          bounds.extend(destination);
          bounds.extend(courierLocation);
          map.fitBounds(bounds, 54);
        }
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
      routeRequestRef.current += 1;
      if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
      routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
      routePolylinesRef.current = [];
      routeViewportRef.current = null;
      if (destinationMarkerRef.current) destinationMarkerRef.current.map = null;
      if (courierMarkerRef.current) courierMarkerRef.current.map = null;
      destinationMarkerRef.current = null;
      courierMarkerRef.current = null;
      markerLibraryRef.current = null;
      mapRef.current = null;
    };
  }, [destination.lat, destination.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const markerLibrary = markerLibraryRef.current;
    if (!map || !markerLibrary || state !== "ready" || !courierLocation) return;

    if (courierMarkerRef.current) {
      const marker = courierMarkerRef.current;
      const start = lastCourierPositionRef.current ?? courierLocation;
      const startedAt = performance.now();
      if (animationFrameRef.current != null) cancelAnimationFrame(animationFrameRef.current);
      const animate = (timestamp: number) => {
        const progress = Math.min(1, (timestamp - startedAt) / 900);
        const eased = 1 - (1 - progress) ** 3;
        marker.position = {
          lat: start.lat + (courierLocation.lat - start.lat) * eased,
          lng: start.lng + (courierLocation.lng - start.lng) * eased
        };
        if (progress < 1) animationFrameRef.current = requestAnimationFrame(animate);
        else animationFrameRef.current = null;
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      const courierPin = new markerLibrary.PinElement({
        background: "#1769d2",
        borderColor: "#0f478d",
        glyphColor: "#ffffff",
        glyphText: "C",
        scale: 1.08
      });
      const courierMarker = new markerLibrary.AdvancedMarkerElement({
        map,
        position: courierLocation,
        title: "Poziția curierului",
        zIndex: 3
      });
      courierMarker.append(courierPin);
      courierMarkerRef.current = courierMarker;
    }
    lastCourierPositionRef.current = courierLocation;

    if (!routePolylinesRef.current.length) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(destination);
      bounds.extend(courierLocation);
      map.fitBounds(bounds, 54);
    }
  }, [courierLocation?.lat, courierLocation?.lng, destination.lat, destination.lng, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready" || !showRoute || !courierLocation) {
      if (!courierLocation || !showRoute) {
        routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
        routePolylinesRef.current = [];
        routeViewportRef.current = null;
        lastRoutedOriginRef.current = null;
        setRouteSummary(null);
        setRouteState("idle");
      }
      return;
    }

    const lastOrigin = lastRoutedOriginRef.current;
    if (
      lastOrigin &&
      routePolylinesRef.current.length &&
      coordinateDistanceKm(lastOrigin, courierLocation) < ROUTE_RECALCULATION_DISTANCE_KM
    ) {
      return;
    }

    let cancelled = false;
    const requestId = routeRequestRef.current + 1;
    routeRequestRef.current = requestId;
    setRouteState("loading");

    void loadGoogleRoutes()
      .then(({ Route }) => Route.computeRoutes({
        origin: courierLocation,
        destination,
        travelMode: "DRIVING",
        routingPreference: "TRAFFIC_UNAWARE",
        polylineQuality: "OVERVIEW",
        fields: ["path", "distanceMeters", "durationMillis", "viewport"],
        language: "ro",
        region: "ro"
      }))
      .then(({ routes }) => {
        if (cancelled || routeRequestRef.current !== requestId) return;
        const route = routes?.[0];
        if (!route) throw new Error("Nu a fost găsit un traseu rutier.");

        routePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
        const polylines = route.createPolylines({
          polylineOptions: {
            strokeColor: "#c52b1c",
            strokeOpacity: 0.9,
            strokeWeight: 6,
            zIndex: 1
          }
        });
        polylines.forEach((polyline) => polyline.setMap(map));
        routePolylinesRef.current = polylines;
        routeViewportRef.current = route.viewport ?? null;
        lastRoutedOriginRef.current = courierLocation;
        setRouteSummary({
          distanceMeters: route.distanceMeters ?? 0,
          durationMillis: route.durationMillis ?? null
        });
        setRouteState("ready");
        if (route.viewport) map.fitBounds(route.viewport, 54);
      })
      .catch(() => {
        if (!cancelled && routeRequestRef.current === requestId) setRouteState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [courierLocation?.lat, courierLocation?.lng, destination.lat, destination.lng, showRoute, state]);

  useEffect(() => {
    if (!isFullscreen) return;
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.classList.add("has-live-map-fullscreen");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    const frame = requestAnimationFrame(() => {
      const map = mapRef.current;
      if (!map) return;
      google.maps.event.trigger(map, "resize");
      if (routeViewportRef.current) map.fitBounds(routeViewportRef.current, 54);
      else if (courierLocation) {
        const bounds = new google.maps.LatLngBounds();
        bounds.extend(destination);
        bounds.extend(courierLocation);
        map.fitBounds(bounds, 54);
      }
      fullscreenButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("has-live-map-fullscreen");
      requestAnimationFrame(() => {
        const map = mapRef.current;
        if (map) google.maps.event.trigger(map, "resize");
        activeElement?.focus();
      });
    };
  }, [isFullscreen]);

  const routeDuration = routeSummary ? durationLabel(routeSummary.durationMillis) : null;

  return (
    <section
      className={`live-delivery-map${compact ? " is-compact" : ""}${isFullscreen ? " is-fullscreen" : ""}`}
      aria-label={label}
    >
      <div ref={elementRef} className="live-delivery-map-canvas" />
      {showRoute && courierLocation && routeState !== "idle" && (
        <div className={`live-delivery-route-status is-${routeState}`} role="status" aria-live="polite">
          {routeState === "ready" && routeSummary ? (
            <>
              <RouteIcon aria-hidden="true" />
              <span><strong>{distanceLabel(routeSummary.distanceMeters)}</strong>{routeDuration ? ` · ${routeDuration}` : ""}</span>
            </>
          ) : routeState === "loading" ? (
            <><Clock3 aria-hidden="true" /><span>Calculez traseul rutier…</span></>
          ) : (
            <><RouteIcon aria-hidden="true" /><span>Traseul rutier nu este disponibil.</span></>
          )}
        </div>
      )}
      {allowFullscreen && (
        <button
          ref={fullscreenButtonRef}
          className="live-delivery-fullscreen-button"
          type="button"
          aria-label={isFullscreen ? "Închide harta pe tot ecranul" : "Deschide harta pe tot ecranul"}
          aria-pressed={isFullscreen}
          onClick={() => setIsFullscreen((current) => !current)}
        >
          {isFullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          <span>{isFullscreen ? "Ieși" : "Ecran complet"}</span>
        </button>
      )}
      {isFullscreen && <div className="live-delivery-fullscreen-title">{label}</div>}
      {state === "loading" && <div className="live-delivery-map-state" role="status">Se încarcă harta…</div>}
      {state === "error" && (
        <div className="live-delivery-map-state is-error" role="status">
          <MapPin aria-hidden="true" />
          Harta nu este disponibilă momentan.
        </div>
      )}
    </section>
  );
}
