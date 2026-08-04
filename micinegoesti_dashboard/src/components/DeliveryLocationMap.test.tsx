// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryLocationMap from "./DeliveryLocationMap";

const mapsMocks = vi.hoisted(() => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(),
  geocode: vi.fn(),
  mapClick: null as ((event: { latLng: { lat: () => number; lng: () => number } }) => void) | null,
  deliveryMarkerOptions: null as { gmpDraggable?: boolean; position?: { lat: number; lng: number } } | null
}));

vi.mock("@googlemaps/js-api-loader", () => {
  class MapMock {
    zoom = 14;

    addListener(_event: string, listener: typeof mapsMocks.mapClick) {
      mapsMocks.mapClick = listener;
      return { remove: vi.fn() };
    }

    getZoom() {
      return this.zoom;
    }

    panTo() {}

    setZoom(zoom: number) {
      this.zoom = zoom;
    }
  }

  class AdvancedMarkerElementMock {
    map: unknown;
    position: { lat: number; lng: number } | null;

    constructor(options: { map?: unknown; position?: { lat: number; lng: number }; gmpDraggable?: boolean }) {
      this.map = options.map;
      this.position = options.position ?? null;
      if (options.gmpDraggable) mapsMocks.deliveryMarkerOptions = options;
    }

    addListener() {
      return { remove: vi.fn() };
    }

    append() {}
  }

  class PinElementMock {}

  class GeocoderMock {
    geocode = mapsMocks.geocode;
  }

  mapsMocks.importLibrary.mockImplementation(async (library: string) => {
    if (library === "maps") return { Map: MapMock };
    if (library === "marker") {
      return { AdvancedMarkerElement: AdvancedMarkerElementMock, PinElement: PinElementMock };
    }
    if (library === "geocoding") return { Geocoder: GeocoderMock };
    throw new Error(`Unexpected Google library: ${library}`);
  });

  return {
    setOptions: mapsMocks.setOptions,
    importLibrary: mapsMocks.importLibrary
  };
});

vi.mock("../api/client", () => ({
  api: {
    reverseGeocode: vi.fn()
  }
}));

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "google-test-key");
  vi.stubEnv("VITE_GOOGLE_MAPS_MAP_ID", "google-test-map-id");
  mapsMocks.geocode.mockResolvedValue({
    results: [{
      formatted_address: "Strada Exemplului 12, București 030000, România",
      types: ["street_address"]
    }]
  });
  mapsMocks.mapClick = null;
  mapsMocks.deliveryMarkerOptions = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("DeliveryLocationMap", () => {
  it("turns a Google Maps click into coordinates and a complete address", async () => {
    const onLocationChange = vi.fn();
    const onAddressResolved = vi.fn();
    const onAddressResolutionChange = vi.fn();

    render(
      <DeliveryLocationMap
        value={null}
        storeLocation={{ lat: 44.380758, lng: 26.167395 }}
        onLocationChange={onLocationChange}
        onAddressResolved={onAddressResolved}
        onAddressResolutionChange={onAddressResolutionChange}
      />
    );

    await waitFor(() => expect(mapsMocks.mapClick).toBeTypeOf("function"));
    expect(screen.getByLabelText("Hartă Google pentru selectarea punctului de livrare")).toBeVisible();

    act(() => {
      mapsMocks.mapClick?.({
        latLng: {
          lat: () => 44.401,
          lng: () => 26.102
        }
      });
    });

    expect(onLocationChange).toHaveBeenCalledWith({ lat: 44.401, lng: 26.102 });
    await waitFor(() => {
      expect(onAddressResolved).toHaveBeenCalledWith(
        "Strada Exemplului 12, București 030000, România"
      );
    });
    expect(onAddressResolutionChange).toHaveBeenCalledWith(true);
    expect(onAddressResolutionChange).toHaveBeenLastCalledWith(false);
    expect(mapsMocks.deliveryMarkerOptions).toMatchObject({
      gmpDraggable: true,
      position: { lat: 44.401, lng: 26.102 }
    });
  });
});
