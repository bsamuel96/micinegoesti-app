import type { Order } from "../api/types";

export type GeoCoordinates = { lat: number; lng: number };

function radians(value: number) {
  return (value * Math.PI) / 180;
}

export function deliveryDistanceKm(from: GeoCoordinates, to: GeoCoordinates) {
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const fromLatitude = radians(from.lat);
  const toLatitude = radians(to.lat);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function sortDeliveriesByDistance(orders: Order[], courierLocation: GeoCoordinates | null) {
  return [...orders].sort((first, second) => {
    const firstDistance = courierLocation && first.mapPin ? deliveryDistanceKm(courierLocation, first.mapPin) : null;
    const secondDistance = courierLocation && second.mapPin ? deliveryDistanceKm(courierLocation, second.mapPin) : null;
    if (firstDistance != null && secondDistance != null && firstDistance !== secondDistance) {
      return firstDistance - secondDistance;
    }
    if (firstDistance != null && secondDistance == null) return -1;
    if (firstDistance == null && secondDistance != null) return 1;
    return new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime() || first.id - second.id;
  });
}
