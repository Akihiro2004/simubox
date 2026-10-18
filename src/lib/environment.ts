// Look of the world around the lesson: sky, light, ground and scenery. The AI
// restyles a template world with set_environment (e.g. turn the sports court
// into a Moon test track) without changing its layout or measurements.

export const ENV_PRESETS = ["earth", "moon", "mars", "mercury", "venus", "jupiter", "saturn", "uranus", "neptune", "night", "dusk", "desert", "snow", "underwater"] as const;
export type EnvPreset = (typeof ENV_PRESETS)[number];
export const LIGHTS = ["day", "dusk", "night", "harsh", "dim"] as const;
export type LightMood = (typeof LIGHTS)[number];

export interface Environment {
  preset: EnvPreset;
  /** Background colour; null keeps the app's daylight backdrop. */
  sky: string | null;
  /** Colour of the outdoor ground around the play area (court/stage); null keeps the template's. */
  ground: string | null;
  /** Colour of painted play surfaces (court lanes and track); null keeps the paint. */
  surface: string | null;
  light: LightMood;
  /** Distance haze colour; null = none. */
  fog: string | null;
  /** false hides the template's scenery (trees, benches, lamps, signs). */
  scenery: boolean;
  stars: boolean;
  /** Earth hanging in the sky (Moon scenes). */
  earth: boolean;
  /** Impact craters on the ground (Moon, Mars). */
  craters: boolean;
}

const EARTH: Environment = { preset: "earth", sky: null, ground: null, surface: null, light: "day", fog: null, scenery: true, stars: false, earth: false, craters: false };

export const PRESETS: Record<EnvPreset, Environment> = {
  earth: EARTH,
  moon: { preset: "moon", sky: "#04060c", ground: "#a3a29d", surface: "#8d8c87", light: "harsh", fog: null, scenery: false, stars: true, earth: true, craters: true },
  mars: { preset: "mars", sky: "#d8a27c", ground: "#b4643c", surface: "#9a5434", light: "dusk", fog: "#d8a27c", scenery: false, stars: false, earth: false, craters: true },
  mercury: { ...EARTH, preset: "mercury", sky: "#080c16", ground: "#8c8175", surface: "#696b70", light: "harsh", scenery: false, stars: true, craters: true },
  venus: { ...EARTH, preset: "venus", sky: "#d4ab6e", ground: "#ab7846", surface: "#80644d", light: "dim", fog: "#d4ab6e", scenery: false },
  jupiter: { ...EARTH, preset: "jupiter", sky: "#131c2e", ground: "#bd9672", surface: "#394e63", light: "day", scenery: false, stars: true },
  saturn: { ...EARTH, preset: "saturn", sky: "#151e30", ground: "#d5c393", surface: "#465665", light: "day", scenery: false, stars: true },
  uranus: { ...EARTH, preset: "uranus", sky: "#101e30", ground: "#9bd3d7", surface: "#3c5965", light: "day", scenery: false, stars: true },
  neptune: { ...EARTH, preset: "neptune", sky: "#0d1831", ground: "#528bca", surface: "#374b69", light: "day", scenery: false, stars: true },
  night: { preset: "night", sky: "#0b1430", ground: null, surface: null, light: "night", fog: "#0b1430", scenery: true, stars: true, earth: false, craters: false },
  dusk: { preset: "dusk", sky: "#f0b98d", ground: null, surface: null, light: "dusk", fog: "#f0c9a6", scenery: true, stars: false, earth: false, craters: false },
  desert: { preset: "desert", sky: "#f3dcb5", ground: "#e2c28c", surface: "#cfa970", light: "harsh", fog: "#f3dcb5", scenery: false, stars: false, earth: false, craters: false },
  snow: { preset: "snow", sky: "#dfe8f1", ground: "#f4f7fb", surface: null, light: "day", fog: "#e8eef5", scenery: true, stars: false, earth: false, craters: false },
  underwater: { preset: "underwater", sky: "#0f5d7a", ground: "#c9b88c", surface: "#b9a77c", light: "dim", fog: "#13708f", scenery: false, stars: false, earth: false, craters: false },
};

export type EnvironmentPatch = Partial<Omit<Environment, "preset">> & { preset?: EnvPreset };

export const isGiantPlanet = (preset?: string) => ["jupiter", "saturn", "uranus", "neptune"].includes(preset ?? "");
export const isPlanetary = (preset?: string) => ["moon", "mars", "mercury", "venus"].includes(preset ?? "") || isGiantPlanet(preset);

/** Mercury and Mars have almost identical gravity: only infer the named UI presets. */
export function environmentForGravity(g: number): EnvPreset | undefined {
  return ([ [1.62, "moon"], [3.71, "mars"], [9.81, "earth"], [24.79, "jupiter"] ] as const)
    .find(([value]) => Math.abs(value - g) < .05)?.[1];
}

/** A preset (if given) replaces the current look; other fields fine-tune it. */
export function applyEnvironment(current: Environment | null, patch: EnvironmentPatch): Environment {
  const base = patch.preset ? PRESETS[patch.preset] : (current ?? EARTH);
  const out: Environment = { ...base };
  for (const [k, v] of Object.entries(patch)) if (k in EARTH && k !== "preset" && v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  // A colour override must never bring Earth vegetation onto another planet.
  if (isPlanetary(out.preset)) out.scenery = false;
  if (isGiantPlanet(out.preset)) out.craters = false;
  return out;
}
