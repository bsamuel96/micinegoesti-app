// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDeliveryMap } from "./LiveDeliveryMap";

const mapsMocks = vi.hoisted(() => ({
  computeRoutes: vi.fn(),
  fitBounds: vi.fn(),
  polylineSetMap: vi.fn(),
  resize: vi.fn()
}));

vi.mock("../lib/googleMaps", () => {
  class MapMock {
    fitBounds = mapsMocks.fitBounds;
  }

  class AdvancedMarkerElementMock {
    map: unknown;
    position: { lat: number; lng: number };

    constructor(options: { map?: unknown; position: { lat: number; lng: number } }) {
      this.map = options.map;
      this.position = options.position;
    }

    append() {}
  }

  class PinElementMock {}

  return {
    configuredGoogleMapsMapId: () => "test-map-id",
    loadGoogleMaps: vi.fn(async () => ({
      Map: MapMock,
      AdvancedMarkerElement: AdvancedMarkerElementMock,
      PinElement: PinElementMock
    })),
    loadGoogleRoutes: vi.fn(async () => ({ Route: { computeRoutes: mapsMocks.computeRoutes } }))
  };
});

beforeEach(() => {
  class LatLngBoundsMock {
    extend() {}
  }

  vi.stubGlobal("google", {
    maps: {
      LatLngBounds: LatLngBoundsMock,
      event: { trigger: mapsMocks.resize }
    }
  });
  mapsMocks.computeRoutes.mockResolvedValue({
    routes: [{
      distanceMeters: 1800,
      durationMillis: 6 * 60_000,
      viewport: new LatLngBoundsMock(),
      createPolylines: () => [{ setMap: mapsMocks.polylineSetMap }]
    }]
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  document.body.classList.remove("has-live-map-fullscreen");
});

describe("LiveDeliveryMap", () => {
  it("draws a driving route and opens it in a focused fullscreen view", async () => {
    render(
      <LiveDeliveryMap
        allowFullscreen
        destination={{ lat: 44.41, lng: 26.11 }}
        courierLocation={{ lat: 44.4, lng: 26.1 }}
        label="Navigare internă spre client"
      />
    );

    await waitFor(() => expect(mapsMocks.computeRoutes).toHaveBeenCalledWith(expect.objectContaining({
      origin: { lat: 44.4, lng: 26.1 },
      destination: { lat: 44.41, lng: 26.11 },
      travelMode: "DRIVING",
      fields: ["path", "distanceMeters", "durationMillis", "viewport"]
    })));
    expect(await screen.findByText("1.8 km")).toBeVisible();
    expect(screen.getByText(/6 min/)).toBeVisible();
    expect(mapsMocks.polylineSetMap).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Deschide harta pe tot ecranul" }));
    expect(screen.getByLabelText("Navigare internă spre client")).toHaveClass("is-fullscreen");
    expect(document.body).toHaveClass("has-live-map-fullscreen");

    fireEvent.click(screen.getByRole("button", { name: "Închide harta pe tot ecranul" }));
    expect(screen.getByLabelText("Navigare internă spre client")).not.toHaveClass("is-fullscreen");
  });

  it("keeps the current route while the courier has moved less than 35 metres", async () => {
    const { rerender } = render(
      <LiveDeliveryMap
        destination={{ lat: 44.41, lng: 26.11 }}
        courierLocation={{ lat: 44.4, lng: 26.1 }}
      />
    );
    await waitFor(() => expect(mapsMocks.computeRoutes).toHaveBeenCalledTimes(1));

    rerender(
      <LiveDeliveryMap
        destination={{ lat: 44.41, lng: 26.11 }}
        courierLocation={{ lat: 44.4001, lng: 26.1001 }}
      />
    );

    await waitFor(() => expect(screen.getByText("1.8 km")).toBeVisible());
    expect(mapsMocks.computeRoutes).toHaveBeenCalledTimes(1);
  });
});
