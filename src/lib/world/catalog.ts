// Shared catalog of worlds, assets and characters. Pure data: used by the
// server (to tell Gemini what exists) and by the client (to render it).

import { FURNITURE } from "./furnishings";
import { NATURE_ASSETS } from "./nature";
import { LEARNING_ASSETS } from "./learning-assets";
import { PROJECTILE_LIMITS } from "../engine/projectile";

export type Vec3 = [number, number, number];

export const WORLD_IDS = ["bedroom", "court", "lab", "park", "stage", "space", "ocean", "math", "globe", "workshop", "optics"] as const;
export type WorldId = (typeof WORLD_IDS)[number];

export interface WorldDef {
  id: WorldId;
  name: string;
  description: string;
  /** Axis-aligned bounds objects may be placed in (meters). */
  bounds: { min: Vec3; max: Vec3 };
  camera: { position: Vec3; target: Vec3 };
  /** Where the guide robot stands by default. */
  guideSpot: Vec3;
}

export const WORLDS: Record<WorldId, WorldDef> = {
  bedroom: {
    id: "bedroom",
    name: "Cozy Bedroom",
    description: "Furnished room with bed, desk, shelf and loose toys/books. Best for gravity, forces, collisions, inertia.",
    bounds: { min: [-3.8, 0, -3.8], max: [3.8, 3.6, 3.8] },
    camera: { position: [11.2, 9.4, 11.2], target: [0.3, -0.1, 0.5] },
    guideSpot: [1.6, 0, 2.2],
  },
  court: {
    id: "court",
    name: "Sports Court",
    description: "Long outdoor court with a ball launcher at the origin and distance markers along +x. Best for projectile motion, speed, distance.",
    bounds: { min: [-4, 0, -7], max: [60, 30, 7] },
    camera: { position: [7, 9, 19], target: [8, -0.5, 0] },
    guideSpot: [-1.5, 0, 2.2],
  },
  lab: {
    id: "lab",
    name: "Science Lab",
    description: "Clean lab with a glowing display pedestal in the middle. Best for atoms, molecules, chemistry.",
    bounds: { min: [-3.8, 0, -3.8], max: [3.8, 4, 3.8] },
    camera: { position: [9.6, 8, 9.6], target: [0.2, 0.9, 0.4] },
    guideSpot: [2.4, 0, -1.4],
  },
  park: {
    id: "park",
    name: "Sunny Park",
    description: "Grassy island with trees, rocks and sky. Best for biology, plants, weather, earth science, everyday physics outdoors.",
    bounds: { min: [-6, 0, -6], max: [6, 8, 6] },
    camera: { position: [13, 10.5, 13], target: [0, -0.2, 0.5] },
    guideSpot: [2, 0, 3],
  },
  stage: {
    id: "stage",
    name: "Idea Stage",
    description: "Minimal round floating stage for diagrams built from primitives, arrows and labels. Best for math, astronomy, concepts with no dedicated world.",
    bounds: { min: [-5, 0, -5], max: [5, 6, 5] },
    camera: { position: [11, 9, 11], target: [0, 0.2, 0.5] },
    guideSpot: [2.6, 0, 2.6],
  },
  space: {
    id: "space",
    name: "Space Observatory",
    description: "A deck floating in space with the Sun in the middle. Best for the solar system, orbits, planets, the Moon's phases, seasons, day and night.",
    bounds: { min: [-13, 0, -13], max: [13, 9, 13] },
    camera: { position: [15.5, 17, 19.5], target: [0, 0, 0.5] },
    guideSpot: [3.4, 0, 8.2],
  },
  ocean: {
    id: "ocean",
    name: "Ocean Dock",
    description: "A cut-away water tank with a sandy floor and a wooden dock; the water surface is at y = 2.6. Best for floating and sinking, density, buoyancy, water pressure, marine life.",
    bounds: { min: [-3.7, 0, -3.7], max: [3.7, 5, 3.7] },
    camera: { position: [11.5, 10.5, 11.5], target: [0.2, 0.8, 0.4] },
    guideSpot: [2.9, 2.95, 2.9],
  },
  math: {
    id: "math",
    name: "Math Grid",
    description: "A graph-paper platform with a big standing graph board for y = f(x), points and vectors, plus floor space for 3D shapes. Best for algebra, functions, geometry, area, volume, fractions.",
    bounds: { min: [-6, 0, -6], max: [6, 6, 6] },
    camera: { position: [11, 9, 11], target: [0, 1.6, 0] },
    guideSpot: [3.6, 0, 2.8],
  },
  globe: {
    id: "globe",
    name: "Geography Globe",
    description: "A large Earth globe with real continents and borders, which can switch to a flat world map. Best for geography, countries, climate zones, latitude and longitude, time zones, history.",
    bounds: { min: [-5, 0, -5], max: [5, 7, 5] },
    camera: { position: [10.5, 8, 10.5], target: [0, 2.4, 0] },
    guideSpot: [3, 0, 2.8],
  },
  workshop: {
    id: "workshop",
    name: "Maker Workshop",
    description: "A workshop room with a workbench. Best for electricity and circuits, levers and simple machines, waves and sound, magnets, energy.",
    bounds: { min: [-3.8, 0, -3.8], max: [3.8, 3.6, 3.8] },
    camera: { position: [11.2, 9.4, 11.2], target: [0.3, 0.2, 0.5] },
    guideSpot: [2.3, 0, 2.6],
  },
  optics: {
    id: "optics",
    name: "Light Lab",
    description: "A bright optics studio with a high-contrast optical table and RGB projection screen. Reflection, Snell refraction, Fresnel power, dispersion, ideal thin lenses, spherical mirrors, real and virtual images, and colour mixing. Wavelength, screen power and lighting are adjustable.",
    bounds: { min: [-3.8, 0, -3.8], max: [3.8, 3.6, 3.8] },
    camera: { position: [6.4, 10.8, 9.6], target: [0, 0.75, 0.25] },
    guideSpot: [2.9, 0, 2.5],
  },
};

export type Collider = "ball" | "cuboid" | "hull";

export interface AssetDef {
  id: string;
  name: string;
  /** Bounding size in meters at scale 1. */
  size: Vec3;
  collider: Collider;
  massKg: number;
  /** Physics behaviour when spawned without an explicit choice. */
  defaultPhysics: "dynamic" | "static" | "none";
  color: string;
  tags: string[];
  /** Extra linear damping as a stand-in for air drag (feathers, paper). */
  drag?: number;
  bounciness?: number;
}

// All assets are original procedural low-poly models built from primitives
// in this repo (see components/world/assets). No third-party files.
const A = (a: AssetDef) => a;
export const ASSETS = {
  ...LEARNING_ASSETS,
  ...FURNITURE,
  ...NATURE_ASSETS,
  ball_red: A({ id: "ball_red", name: "Red ball", size: [0.3, 0.3, 0.3], collider: "ball", massKg: 0.4, defaultPhysics: "dynamic", color: "#ef4444", tags: ["ball", "toy"], bounciness: 0.7 }),
  ball_blue: A({ id: "ball_blue", name: "Blue ball", size: [0.3, 0.3, 0.3], collider: "ball", massKg: 0.4, defaultPhysics: "dynamic", color: "#3b82f6", tags: ["ball", "toy"], bounciness: 0.7 }),
  basketball: A({ id: "basketball", name: "Basketball", size: [0.24, 0.24, 0.24], collider: "ball", massKg: 0.62, defaultPhysics: "dynamic", color: "#f97316", tags: ["ball", "sport"], bounciness: 0.75 }),
  soccer_ball: A({ id: "soccer_ball", name: "Soccer ball", size: [0.22, 0.22, 0.22], collider: "ball", massKg: 0.43, defaultPhysics: "dynamic", color: "#f8fafc", tags: ["ball", "sport"], bounciness: 0.7 }),
  tennis_ball: A({ id: "tennis_ball", name: "Tennis ball", size: [0.067, 0.067, 0.067], collider: "ball", massKg: 0.058, defaultPhysics: "dynamic", color: "#d9f99d", tags: ["ball", "sport"], bounciness: 0.75 }),
  bowling_ball: A({ id: "bowling_ball", name: "Bowling ball", size: [0.22, 0.22, 0.22], collider: "ball", massKg: 6.5, defaultPhysics: "dynamic", color: "#1e3a8a", tags: ["ball", "heavy"], bounciness: 0.1 }),
  feather: A({ id: "feather", name: "Feather", size: [0.06, 0.02, 0.28], collider: "cuboid", massKg: 0.005, defaultPhysics: "dynamic", color: "#f5f5f4", tags: ["light", "air resistance"], drag: 6, bounciness: 0 }),
  apple: A({ id: "apple", name: "Apple", size: [0.09, 0.1, 0.09], collider: "ball", massKg: 0.15, defaultPhysics: "dynamic", color: "#dc2626", tags: ["fruit", "newton"], bounciness: 0.2 }),
  book: A({ id: "book", name: "Book", size: [0.22, 0.05, 0.16], collider: "cuboid", massKg: 0.5, defaultPhysics: "dynamic", color: "#6366f1", tags: ["book"], bounciness: 0.1 }),
  box: A({ id: "box", name: "Cardboard box", size: [0.4, 0.4, 0.4], collider: "cuboid", massKg: 1, defaultPhysics: "dynamic", color: "#d6a76c", tags: ["box", "container"], bounciness: 0.1 }),
  toy_block: A({ id: "toy_block", name: "Toy block", size: [0.14, 0.14, 0.14], collider: "cuboid", massKg: 0.08, defaultPhysics: "dynamic", color: "#facc15", tags: ["toy", "cube"], bounciness: 0.3 }),
  pillow: A({ id: "pillow", name: "Pillow", size: [0.5, 0.14, 0.34], collider: "cuboid", massKg: 0.6, defaultPhysics: "dynamic", color: "#e0e7ff", tags: ["soft"], bounciness: 0.05 }),
  mug: A({ id: "mug", name: "Mug", size: [0.1, 0.11, 0.1], collider: "hull", massKg: 0.3, defaultPhysics: "dynamic", color: "#f472b6", tags: ["cup"], bounciness: 0.1 }),
  toy_car: A({ id: "toy_car", name: "Toy car", size: [0.3, 0.14, 0.16], collider: "cuboid", massKg: 0.3, defaultPhysics: "dynamic", color: "#22c55e", tags: ["toy", "vehicle", "motion"], bounciness: 0.2 }),
  dice: A({ id: "dice", name: "Dice", size: [0.1, 0.1, 0.1], collider: "cuboid", massKg: 0.02, defaultPhysics: "dynamic", color: "#ffffff", tags: ["probability", "math"], bounciness: 0.4 }),
  rocket_toy: A({ id: "rocket_toy", name: "Toy rocket", size: [0.18, 0.5, 0.18], collider: "hull", massKg: 0.4, defaultPhysics: "dynamic", color: "#e2e8f0", tags: ["space", "toy"], bounciness: 0.1 }),
  ramp: A({ id: "ramp", name: "Ramp", size: [1.2, 0.5, 0.6], collider: "hull", massKg: 5, defaultPhysics: "static", color: "#a78bfa", tags: ["incline", "slope", "forces"] }),
  crate: A({ id: "crate", name: "Wooden crate", size: [0.6, 0.6, 0.6], collider: "cuboid", massKg: 8, defaultPhysics: "dynamic", color: "#b45309", tags: ["box", "heavy"], bounciness: 0.05 }),
  cone: A({ id: "cone", name: "Traffic cone", size: [0.3, 0.45, 0.3], collider: "hull", massKg: 0.8, defaultPhysics: "dynamic", color: "#fb923c", tags: ["marker", "sport"] }),
  plant: A({ id: "plant", name: "Potted plant", size: [0.4, 0.7, 0.4], collider: "cuboid", massKg: 2, defaultPhysics: "static", color: "#22c55e", tags: ["plant", "biology", "photosynthesis"] }),
  flower: A({ id: "flower", name: "Flower", size: [0.2, 0.45, 0.2], collider: "cuboid", massKg: 0.1, defaultPhysics: "static", color: "#f472b6", tags: ["plant", "biology", "pollination"] }),
  tree: A({ id: "tree", name: "Tree", size: [1.4, 2.6, 1.4], collider: "hull", massKg: 300, defaultPhysics: "static", color: "#16a34a", tags: ["plant", "nature", "biology"] }),
  rock: A({ id: "rock", name: "Rock", size: [0.6, 0.4, 0.5], collider: "hull", massKg: 40, defaultPhysics: "static", color: "#94a3b8", tags: ["geology", "nature"] }),
  sun: A({ id: "sun", name: "Sun", size: [1, 1, 1], collider: "ball", massKg: 1, defaultPhysics: "none", color: "#fbbf24", tags: ["space", "light", "energy", "star"] }),
  planet: A({ id: "planet", name: "Planet", size: [0.6, 0.6, 0.6], collider: "ball", massKg: 1, defaultPhysics: "none", color: "#60a5fa", tags: ["space", "astronomy", "earth"] }),
  moon: A({ id: "moon", name: "Moon", size: [0.3, 0.3, 0.3], collider: "ball", massKg: 1, defaultPhysics: "none", color: "#cbd5e1", tags: ["space", "astronomy"] }),
  cloud: A({ id: "cloud", name: "Cloud", size: [1.2, 0.5, 0.7], collider: "cuboid", massKg: 1, defaultPhysics: "none", color: "#ffffff", tags: ["weather", "water cycle"] }),
  water_drop: A({ id: "water_drop", name: "Water drop", size: [0.12, 0.16, 0.12], collider: "ball", massKg: 0.01, defaultPhysics: "none", color: "#38bdf8", tags: ["water", "weather", "water cycle"] }),
  lightbulb: A({ id: "lightbulb", name: "Light bulb", size: [0.16, 0.26, 0.16], collider: "hull", massKg: 0.05, defaultPhysics: "static", color: "#fde68a", tags: ["electricity", "energy", "circuit"] }),
  battery: A({ id: "battery", name: "Battery", size: [0.12, 0.26, 0.12], collider: "cuboid", massKg: 0.1, defaultPhysics: "static", color: "#334155", tags: ["electricity", "energy", "circuit"] }),
  magnet: A({ id: "magnet", name: "Magnet", size: [0.3, 0.3, 0.08], collider: "cuboid", massKg: 0.3, defaultPhysics: "static", color: "#ef4444", tags: ["magnetism", "forces"] }),
  beaker: A({ id: "beaker", name: "Beaker", size: [0.14, 0.2, 0.14], collider: "hull", massKg: 0.2, defaultPhysics: "static", color: "#a5f3fc", tags: ["chemistry", "lab", "liquid"] }),
  flask: A({ id: "flask", name: "Flask", size: [0.18, 0.26, 0.18], collider: "hull", massKg: 0.2, defaultPhysics: "static", color: "#c4b5fd", tags: ["chemistry", "lab", "reaction"] }),
  thermometer: A({ id: "thermometer", name: "Thermometer", size: [0.05, 0.4, 0.05], collider: "cuboid", massKg: 0.05, defaultPhysics: "static", color: "#f87171", tags: ["temperature", "heat"] }),
  ice_cube: A({ id: "ice_cube", name: "Ice cube", size: [0.12, 0.12, 0.12], collider: "cuboid", massKg: 0.02, defaultPhysics: "dynamic", color: "#bae6fd", tags: ["water", "states of matter", "temperature"], bounciness: 0.1 }),
} satisfies Record<string, AssetDef>;

export type AssetId = keyof typeof ASSETS;
export const ASSET_IDS = Object.keys(ASSETS) as [AssetId, ...AssetId[]];

export const PRIMITIVE_SHAPES = ["sphere", "box", "cylinder", "cone", "torus", "ring"] as const;
export type PrimitiveShape = (typeof PRIMITIVE_SHAPES)[number];

export const CHARACTER_KINDS = ["robot", "kid", "teacher", "scientist", "astronaut"] as const;
export type CharacterKind = (typeof CHARACTER_KINDS)[number];

export const ANIMATIONS = ["idle", "wave", "talk", "point", "think", "jump", "celebrate", "surprised"] as const;
export type AnimationName = (typeof ANIMATIONS)[number];

/** The guide robot lives in every world under this id. */
export const GUIDE_ID = "simu";

export const LIMITS = {
  maxObjects: 40,
  maxCharacters: 4,
  maxAnnotations: 8,
  maxVectors: 6,
  maxCommands: 40,
  maxSteps: 8,
  maxPromptChars: 600,
  maxSpeakChars: 240,
  maxImpulse: 25,
  maxSpeed: 40,
  maxGravity: PROJECTILE_LIMITS.gravity.max,
} as const;
