// Solar-system data (NASA planetary fact sheets) and orbital helpers.
// Display distances are compressed so everything fits; real values are
// shown in labels and come from this table, never from the AI.

export const PLANET_IDS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"] as const;
export type PlanetId = (typeof PLANET_IDS)[number];

export interface Planet {
  id: PlanetId;
  name: string;
  radiusKm: number;
  /** Semi-major axis in astronomical units. */
  distanceAU: number;
  /** Orbital period in Earth days. */
  periodDays: number;
  /** Axial tilt in degrees. */
  tiltDeg: number;
  /** Surface gravity, m/s². */
  gravity: number;
  color: string;
  rings?: boolean;
  fact: string;
}

const P = (p: Planet) => p;
export const PLANETS: Record<PlanetId, Planet> = {
  mercury: P({ id: "mercury", name: "Mercury", radiusKm: 2439.7, distanceAU: 0.387, periodDays: 87.97, tiltDeg: 0.03, gravity: 3.7, color: "#b8b1a8", fact: "Closest to the Sun and the fastest planet around it." }),
  venus: P({ id: "venus", name: "Venus", radiusKm: 6051.8, distanceAU: 0.723, periodDays: 224.7, tiltDeg: 177.4, gravity: 8.87, color: "#e6c27a", fact: "The hottest planet, because thick clouds trap heat." }),
  earth: P({ id: "earth", name: "Earth", radiusKm: 6371, distanceAU: 1, periodDays: 365.26, tiltDeg: 23.44, gravity: 9.81, color: "#4b8bd6", fact: "The only planet known to have life." }),
  mars: P({ id: "mars", name: "Mars", radiusKm: 3389.5, distanceAU: 1.524, periodDays: 686.98, tiltDeg: 25.19, gravity: 3.71, color: "#c8643c", fact: "Red because its soil has rusty iron in it." }),
  jupiter: P({ id: "jupiter", name: "Jupiter", radiusKm: 69911, distanceAU: 5.203, periodDays: 4332.59, tiltDeg: 3.13, gravity: 24.79, color: "#d8b98f", fact: "The biggest planet; over 1,000 Earths could fit inside." }),
  saturn: P({ id: "saturn", name: "Saturn", radiusKm: 58232, distanceAU: 9.537, periodDays: 10759.22, tiltDeg: 26.73, gravity: 10.44, color: "#e3cf9a", rings: true, fact: "Its rings are made of ice and rock." }),
  uranus: P({ id: "uranus", name: "Uranus", radiusKm: 25362, distanceAU: 19.19, periodDays: 30688.5, tiltDeg: 97.77, gravity: 8.87, color: "#9fd3e0", rings: true, fact: "It spins on its side." }),
  neptune: P({ id: "neptune", name: "Neptune", radiusKm: 24622, distanceAU: 30.07, periodDays: 60195, tiltDeg: 28.32, gravity: 11.15, color: "#4f6fd8", fact: "The windiest planet." }),
};

export const SUN_RADIUS_KM = 696_000;
export const MOON = { radiusKm: 1737.4, distanceKm: 384_400, siderealDays: 27.32, synodicDays: 29.53, gravity: 1.62 };

/** Compressed display distance (scene units) for an orbit radius in AU. */
export function displayDistance(au: number): number {
  return 1.6 + 2.9 * Math.log(1 + au);
}

/** Compressed display radius for a planet (scene units). */
export function displayRadius(km: number): number {
  return 0.12 + 0.1 * Math.log10(km / 1000 + 1) * 3;
}

/** Orbit angle (radians) after `days`, starting at 0. */
export function orbitAngle(periodDays: number, days: number): number {
  return ((days / periodDays) % 1) * Math.PI * 2;
}

/** Kepler's third law ratio T²/a³ in years²/AU³ (≈ 1 for every planet). */
export function keplerRatio(p: Planet): number {
  const years = p.periodDays / 365.256;
  return (years * years) / p.distanceAU ** 3;
}

/** Fraction of the Moon's face that is lit, `days` after new moon. */
export function moonIllumination(days: number): number {
  return (1 - Math.cos((2 * Math.PI * days) / MOON.synodicDays)) / 2;
}

export function moonPhaseName(days: number): string {
  const f = (((days % MOON.synodicDays) + MOON.synodicDays) % MOON.synodicDays) / MOON.synodicDays;
  const names = ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(f * 8) % 8];
}

/** Latitude where the Sun is straight overhead on a day of the year (approximate). */
export function subsolarLatitude(dayOfYear: number, tiltDeg = PLANETS.earth.tiltDeg): number {
  return tiltDeg * Math.sin((2 * Math.PI * (dayOfYear - 80)) / 365.25);
}

export function seasonNorth(dayOfYear: number): "spring" | "summer" | "autumn" | "winter" {
  const d = ((dayOfYear % 365) + 365) % 365;
  if (d >= 80 && d < 172) return "spring";
  if (d >= 172 && d < 266) return "summer";
  if (d >= 266 && d < 355) return "autumn";
  return "winter";
}
