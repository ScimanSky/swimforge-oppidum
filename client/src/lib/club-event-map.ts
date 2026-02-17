export type RoutePoint = {
  lat: number;
  lng: number;
};

export type RouteGeojson = {
  type: "LineString";
  coordinates: Array<[number, number]>;
};

function finite(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function parseRouteGeojson(raw: unknown): RouteGeojson | null {
  if (!raw) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== "object") return null;
  const typed = value as { type?: unknown; coordinates?: unknown };
  if (typed.type !== "LineString" || !Array.isArray(typed.coordinates)) return null;

  const coordinates: Array<[number, number]> = [];
  for (const item of typed.coordinates) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const lng = finite(item[0]);
    const lat = finite(item[1]);
    if (lng === null || lat === null) return null;
    coordinates.push([lng, lat]);
  }

  if (coordinates.length < 2) return null;
  return { type: "LineString", coordinates };
}

export function routeGeojsonToPoints(route: RouteGeojson | null): RoutePoint[] {
  if (!route) return [];
  return route.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

export function pointsToRouteGeojson(points: RoutePoint[]): RouteGeojson | null {
  if (!points || points.length < 2) return null;
  return {
    type: "LineString",
    coordinates: points.map((p) => [p.lng, p.lat]),
  };
}

export function haversineMeters(a: RoutePoint, b: RoutePoint) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const y = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * y;
}

export function routeDistanceMeters(points: RoutePoint[]) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return Math.round(total);
}
