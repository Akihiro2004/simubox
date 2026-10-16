// Geography helpers and a curated list of places with checked coordinates.
// Gemini should prefer these ids; custom latitude/longitude is allowed but
// labelled approximate.

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: "city" | "landmark" | "nature" | "pole";
}

const C = (id: string, name: string, lat: number, lon: number, kind: Place["kind"] = "city"): Place => ({ id, name, lat, lon, kind });

export const PLACES: Place[] = [
  C("jakarta", "Jakarta", -6.2088, 106.8456),
  C("singapore", "Singapore", 1.3521, 103.8198),
  C("kuala_lumpur", "Kuala Lumpur", 3.139, 101.6869),
  C("bangkok", "Bangkok", 13.7563, 100.5018),
  C("manila", "Manila", 14.5995, 120.9842),
  C("tokyo", "Tokyo", 35.6762, 139.6503),
  C("seoul", "Seoul", 37.5665, 126.978),
  C("beijing", "Beijing", 39.9042, 116.4074),
  C("new_delhi", "New Delhi", 28.6139, 77.209),
  C("mumbai", "Mumbai", 19.076, 72.8777),
  C("sydney", "Sydney", -33.8688, 151.2093),
  C("denpasar", "Denpasar, Bali", -8.6705, 115.2126),
  C("cairo", "Cairo", 30.0444, 31.2357),
  C("nairobi", "Nairobi", -1.2921, 36.8219),
  C("lagos", "Lagos", 6.5244, 3.3792),
  C("cape_town", "Cape Town", -33.9249, 18.4241),
  C("london", "London", 51.5072, -0.1276),
  C("paris", "Paris", 48.8566, 2.3522),
  C("rome", "Rome", 41.9028, 12.4964),
  C("berlin", "Berlin", 52.52, 13.405),
  C("moscow", "Moscow", 55.7558, 37.6173),
  C("istanbul", "Istanbul", 41.0082, 28.9784),
  C("mecca", "Mecca", 21.3891, 39.8579),
  C("new_york", "New York", 40.7128, -74.006),
  C("washington", "Washington, D.C.", 38.9072, -77.0369),
  C("los_angeles", "Los Angeles", 34.0522, -118.2437),
  C("mexico_city", "Mexico City", 19.4326, -99.1332),
  C("rio", "Rio de Janeiro", -22.9068, -43.1729),
  C("buenos_aires", "Buenos Aires", -34.6037, -58.3816),
  C("lima", "Lima", -12.0464, -77.0428),
  C("everest", "Mount Everest", 27.9881, 86.925, "nature"),
  C("fuji", "Mount Fuji", 35.3606, 138.7274, "nature"),
  C("krakatoa", "Krakatoa", -6.1021, 105.423, "nature"),
  C("amazon", "Amazon rainforest (Manaus)", -3.119, -60.0217, "nature"),
  C("great_barrier_reef", "Great Barrier Reef", -18.2871, 147.6992, "nature"),
  C("grand_canyon", "Grand Canyon", 36.1069, -112.1129, "nature"),
  C("giza", "Pyramids of Giza", 29.9792, 31.1342, "landmark"),
  C("borobudur", "Borobudur", -7.6079, 110.2038, "landmark"),
  C("greenwich", "Greenwich (0° longitude)", 51.4769, -0.0005, "landmark"),
  C("north_pole", "North Pole", 90, 0, "pole"),
  C("south_pole", "South Pole", -90, 0, "pole"),
];
export const PLACE_IDS = PLACES.map((p) => p.id) as [string, ...string[]];

/**
 * Position on a sphere of radius r for a latitude/longitude in degrees,
 * matching three.js SphereGeometry UVs with an equirectangular map
 * (longitude 0 on +x, 90°E on -z, north pole on +y).
 */
export function latLonToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)];
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Hours ahead of UTC from longitude alone (solar time zone, not political). */
export function solarTimeOffset(lon: number): number {
  return Math.round(lon / 15);
}

export function hemisphere(lat: number): "northern" | "southern" | "equator" {
  return Math.abs(lat) < 0.5 ? "equator" : lat > 0 ? "northern" : "southern";
}
