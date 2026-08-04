import { describe, expect, it } from "vitest";
import { getDeliveryLocationStatus, haversineDistanceKm, isValidCoordinates } from "./delivery-location.js";

describe("delivery location", () => {
  it("validates coordinate ranges", () => {
    expect(isValidCoordinates({ lat: 44.4, lng: 26.1 })).toBe(true);
    expect(isValidCoordinates({ lat: 100, lng: 26.1 })).toBe(false);
    expect(isValidCoordinates(undefined)).toBe(false);
  });

  it("calculates Haversine distance", () => {
    expect(haversineDistanceKm({ lat: 44.4268, lng: 26.1025 }, { lat: 44.4397, lng: 26.0963 })).toBeCloseTo(1.5, 0);
  });

  it("marks a valid order location outside the configured radius without rejecting its coordinates", () => {
    expect(getDeliveryLocationStatus({ lat: 44.4, lng: 26.1 }, { lat: 45.4, lng: 26.1 }, 15)).toMatchObject({
      isOutsideDeliveryArea: true
    });
  });
});
