// SimuBox Scene Protocol (SSP) v1. Gemini returns a ScenePlan; every
// command is validated here before the client ever executes it.

import { z } from "zod";
import { ANIMATIONS, ASSET_IDS, CHARACTER_KINDS, LIMITS, PRIMITIVE_SHAPES, WORLD_IDS } from "../world/catalog";
import { ELEMENT_SYMBOLS, MOLECULE_IDS } from "../engine/chemistry";
import { PLANET_IDS } from "../engine/astro";
import { PLACE_IDS } from "../engine/geo";
import { FLUID_IDS, MATERIAL_IDS, SUBSTANCE_IDS } from "../engine/physics2";
import { SHAPE_KINDS } from "../engine/geometry";
import { CELL_KINDS, ORGANELLES } from "../engine/biology";
import { ENV_PRESETS, LIGHTS } from "../environment";
import { PeriodicTableFields } from "../periodic-table";
import { LIGHT_COLOR_IDS, OPTIC_KINDS, OPTIC_MATERIAL_IDS, OPTIC_PRESETS, SOURCE_KINDS, TABLE } from "../engine/optics";
import { PLAN, SIGNAL_KIND_IDS, SIGNAL_LAYOUTS, WALL_MATERIALS } from "../engine/waves";
import { MechanicsFields, MathFields } from "../experiments";

export const SCHEMA_VERSION = 1;

const num = (min: number, max: number) => z.number().min(min).max(max);
const vec3 = (lim: number) => z.array(num(-lim, lim)).length(3);
const Pos = vec3(60).describe("[x, y, z] in meters; y is up, floor is y = 0");
const Id = z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).describe("snake_case id");
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("hex color like #ff8800");
const Text = (max: number) => z.string().min(1).max(max);
const Physics = z.enum(["dynamic", "static", "none"]).describe("dynamic = falls/collides, static = fixed collider, none = no physics");
/** [x, z] on the optics table / the signal floor plan (the player keeps z inside the narrower edge). */
const tableXZ = z.array(num(-TABLE.x, TABLE.x)).length(2);
const planXZ = z.array(num(-PLAN.x, PLAN.x)).length(2);
export const RIPPLE_SOURCES = ["point", "two_point", "plane"] as const;
export const RIPPLE_BARRIERS = ["none", "wall", "gap", "double_slit", "reflector"] as const;

/** Placeholders the client fills from deterministic engine results. */
export const PLACEHOLDERS = [
  "mechanics_time", "mechanics_velocity", "mechanics_velocity2", "mechanics_acceleration", "mechanics_force", "mechanics_momentum", "mechanics_total_momentum", "mechanics_kinetic", "mechanics_potential", "mechanics_impulse", "mechanics_distance", "mechanics_period", "math_answer", "math_formula",
  "range", "flight_time", "max_height", "speed", "angle", "gravity", "impact_speed",
  "current", "total_resistance", "power", "voltage",
  "wave_speed", "wave_period",
  "wind_speed",
  "torque_left", "torque_right", "balance_distance",
  "phase", "rms_speed", "temperature",
  "day", "season", "moon_phase", "moon_lit",
  "water_wave_speed", "water_wavelength", "water_period", "water_frequency", "water_depth", "water_regime",
  "shallow_wave_speed", "shallow_wavelength", "gap_width", "gap_wavelengths", "doppler_ahead", "doppler_behind",
  "signal_strength", "signal_bars", "signal_distance", "signal_walls", "wall_loss", "path_loss", "signal_wavelength", "signal_frequency", "signal_speed",
  "incidence_angle", "reflection_angle", "refraction_angle", "critical_angle", "refractive_index", "light_speed_in",
  "deviation", "spread_angle", "focal_length", "object_distance", "image_distance", "magnification", "image_type",
  "beam_wavelength", "screen_power", "reflectance",
] as const;
/** Optics placeholders that can name one element, e.g. {{refraction_angle:block}}. */
export const OPTIC_ARG_PLACEHOLDERS = ["incidence_angle", "reflection_angle", "refraction_angle", "critical_angle", "refractive_index", "light_speed_in", "focal_length", "screen_power", "reflectance"] as const;
/** Placeholders that take an argument, written {{name:arg}}. */
export const ARG_PLACEHOLDERS = {
  volume: "shape id",
  surface_area: "shape id",
  float_fraction: "object id",
  mass: "object id (its real mass in the physics engine)",
  density: "object id",
  period: "planet id",
  planet_gravity: "planet id",
  distance_au: "planet id",
  sunlight: "planet id (sunlight it gets compared with Earth today; follows moved orbits)",
  sunlight_change: "planet id (sunlight now compared with its own real orbit, e.g. after a swap)",
  radius_km: "planet id",
  distance_km: "two place or mark ids joined by ~, e.g. london~new_york",
  ...Object.fromEntries(OPTIC_ARG_PLACEHOLDERS.map((p) => [p, "optics element id (the main beam's first meeting with it)"])),
} as Record<string, string>;

/**
 * Every changeable field of each simulation module, for set_module. Patches
 * are partial and strict: unknown fields are rejected so mistakes get repaired.
 */
export const MODULE_FIELDS = {
  mechanics: MechanicsFields.partial(),
  maths: MathFields.partial(),
  orbits: z.strictObject({ mode: z.enum(["solar_system", "earth_moon", "seasons"]), planets: z.array(z.enum(PLANET_IDS)).min(1).max(8), focus: z.enum([...PLANET_IDS, "sun", "moon"]).nullable(), daysPerSecond: num(0, 400), labels: z.boolean(), distances: z.partialRecord(z.enum(PLANET_IDS), num(0.1, 60)) }).partial(),
  fluid: z.strictObject({ fluid: z.enum(FLUID_IDS) }).partial(),
  circuit: z.strictObject({ layout: z.enum(["series", "parallel"]), voltage: num(0, 24), bulbs: z.number().int().min(1).max(4), resistanceOhms: num(1, 100), switchClosed: z.boolean(), brokenBulbs: z.array(z.number().int().min(1).max(4)).max(4) }).partial(),
  wave: z.strictObject({ kind: z.enum(["transverse", "longitudinal"]), amplitude: num(0.05, 1.2), frequency: num(0.1, 4), wavelength: num(0.5, 6) }).partial(),
  lever: z.strictObject({ leftMassKg: num(0.1, 50), leftDistanceM: num(0.1, 2.4), rightMassKg: num(0.1, 50), rightDistanceM: num(0.1, 2.4) }).partial(),
  particles: z.strictObject({ substance: z.enum(SUBSTANCE_IDS), temperatureC: num(-273, 3500) }).partial(),
  cell: z.strictObject({ kind: z.enum(CELL_KINDS), highlight: z.enum(Object.keys(ORGANELLES) as [string, ...string[]]).nullable() }).partial(),
  globe: z.strictObject({ view: z.enum(["globe", "map"]), spin: z.boolean(), focus: z.enum(PLACE_IDS).nullable() }).partial(),
  ripple: z.strictObject({ windSpeedMps: num(0, 20).nullable(), frequencyHz: num(0.3, 3), amplitude: num(0.004, 0.03), depthM: num(0.02, 0.5), source: z.enum(RIPPLE_SOURCES), separationM: num(0.1, 1.2), barrier: z.enum(RIPPLE_BARRIERS), gapWidthM: num(0.05, 1), barrierX: num(-1, 1.3), reflectorAngleDeg: num(-60, 60), shallow: z.boolean(), shallowDepthM: num(0.01, 0.2), sourceSpeed: num(0, 0.5), view: z.enum(["waves", "intensity"]) }).partial(),
  signal: z.strictObject({ kind: z.enum(SIGNAL_KIND_IDS), soundHz: num(50, 8000), layout: z.enum(SIGNAL_LAYOUTS), walls: z.array(z.object({ id: Id, from: planXZ, to: planXZ, material: z.enum(WALL_MATERIALS) })).max(16), allWalls: z.enum(WALL_MATERIALS), source: planXZ, device: planXZ, view: z.enum(["both", "waves", "strength"]) }).partial(),
  optics: z.strictObject({ sourceKind: z.enum(SOURCE_KINDS), sourcePosition: tableXZ, angleDeg: num(-360, 360), color: z.enum(LIGHT_COLOR_IDS), wavelengthNm: num(380, 780).nullable(), reachM: num(0.1, 4), reflections: z.boolean(), lighting: z.enum(["bright", "dim"]), rays: z.number().int().min(1).max(9), spread: num(0.1, 120), aimAt: Id.nullable(), medium: z.enum(["air", "water"]), normals: z.boolean(), object: z.object({ target: Id, distanceM: num(0.2, 2.6), heightM: num(-0.6, 0.6) }).nullable(), mixing: z.object({ red: z.boolean(), green: z.boolean(), blue: z.boolean() }).nullable() }).partial(),
} as const;
export type ModuleName = keyof typeof MODULE_FIELDS;
export const MODULE_NAMES = Object.keys(MODULE_FIELDS) as [ModuleName, ...ModuleName[]];

export const Command = z.discriminatedUnion("op", [
  z.object({ op: z.literal("show_mechanics"), ...MechanicsFields.partial().shape }),
  z.object({ op: z.literal("show_math"), ...MathFields.partial().shape }),
  z.object({ op: z.literal("show_periodic_table"), ...PeriodicTableFields, focus: z.boolean().optional().describe("face the lab wall table; defaults true") }),
  z.object({ op: z.literal("load_world"), world: z.enum(WORLD_IDS) }),
  z.object({
    op: z.literal("spawn_asset"),
    id: Id,
    asset: z.enum(ASSET_IDS),
    position: Pos,
    rotationY: num(-360, 360).optional(),
    scale: num(0.2, 5).optional(),
    color: Color.optional(),
    physics: Physics.optional(),
    material: z.enum(MATERIAL_IDS).optional().describe("sets mass from real density; matters for floating/sinking"),
    label: Text(40).optional(),
  }),
  z.object({
    op: z.literal("spawn_primitive"),
    id: Id,
    shape: z.enum(PRIMITIVE_SHAPES),
    size: z.array(num(0.02, 10)).length(3).describe("[width, height, depth] meters"),
    position: Pos,
    color: Color,
    physics: Physics.optional(),
    opacity: num(0.1, 1).optional(),
    glow: z.boolean().optional(),
    label: Text(40).optional(),
  }),
  z.object({ op: z.literal("remove_object"), id: Id }),
  z.object({ op: z.literal("move_object"), id: Id, position: Pos, durationMs: num(0, 6000).optional() }),
  z.object({ op: z.literal("rotate_object"), id: Id, rotation: vec3(360).describe("degrees around x, y, z") }),
  z.object({
    op: z.literal("set_object_property"),
    id: Id,
    property: z.enum(["color", "mass", "bounciness", "drag", "scale", "label", "visible"]),
    value: z.union([z.string().max(40), z.number().min(-1000).max(1000), z.boolean()]),
  }),
  z.object({ op: z.literal("highlight_object"), id: Id, on: z.boolean() }),
  z.object({ op: z.literal("set_gravity"), gravity: vec3(LIMITS.maxGravity).describe("m/s² vector; Earth [0,-9.81,0], 10× Earth [0,-98.1,0]. Also updates the court trajectory for downward gravity.") }),
  z.object({ op: z.literal("apply_impulse"), id: Id.or(z.literal("all")), impulse: vec3(LIMITS.maxImpulse).describe("N·s; 'all' hits every dynamic object with a gentle random spread") }),
  z.object({ op: z.literal("apply_force"), id: Id, force: vec3(200), durationMs: num(50, 5000) }),
  z.object({ op: z.literal("set_velocity"), id: Id, velocity: vec3(LIMITS.maxSpeed) }),
  z.object({ op: z.literal("reset_simulation") }),
  z.object({ op: z.literal("simulation"), action: z.enum(["play", "pause", "step"]) }),
  z.object({
    op: z.literal("launch_projectile"),
    speed: num(0, 400),
    unit: z.enum(["m/s", "km/h", "mph"]),
    angleDeg: num(0, 90),
    gravity: num(0, LIMITS.maxGravity).optional().describe("m/s²; omit to keep the current downward gravity (a new scene starts at 9.81). 10× Earth = 98.1."),
    heightM: num(0, 20).optional(),
    ball: z.enum(["basketball", "soccer_ball", "tennis_ball", "bowling_ball", "ball_red"]).optional(),
  }),
  z.object({
    op: z.literal("set_parameter"),
    name: z.enum(["gravity", "speed", "angle", "height", "time_speed", "voltage", "frequency", "amplitude", "wavelength", "temperature", "left_mass", "left_distance", "right_mass", "right_distance"]),
    value: num(-273, 3500),
  }),
  z.object({
    op: z.literal("show_annotation"),
    id: Id,
    text: Text(140),
    target: Id.optional().describe("object/character id to anchor to"),
    position: Pos.optional(),
    tone: z.enum(["info", "fact", "warning", "question"]).optional(),
  }),
  z.object({
    op: z.literal("show_vector"),
    id: Id,
    target: Id.optional(),
    origin: Pos.optional(),
    vector: vec3(20),
    color: Color.optional(),
    label: Text(30).optional(),
  }),
  z.object({
    op: z.literal("show_formula"),
    title: Text(60),
    formula: Text(120).describe("plain text, e.g. R = v² · sin(2θ) / g"),
    variables: z.array(z.object({ symbol: Text(8), meaning: Text(60), unit: z.string().max(12).optional() })).max(6),
  }),
  z.object({
    op: z.literal("show_measurement"),
    metric: z.enum(["range", "flight_time", "max_height", "impact_speed", "gravity", "bond_angle", "current", "total_resistance", "power", "wave_speed", "torque_left", "torque_right", "phase", "rms_speed", "day", "season", "moon_phase", "volume", "surface_area", "float_fraction", "water_wave_speed", "water_wavelength", "signal_strength", "signal_bars", "incidence_angle", "reflection_angle", "refraction_angle", "critical_angle", "image_distance", "magnification", "deviation", "beam_wavelength", "screen_power", "reflectance"]),
    target: Id.optional().describe("shape or object id for volume, surface_area, float_fraction; optics element id for the angles"),
  }),
  z.object({ op: z.literal("clear_annotations") }),
  z.object({ op: z.literal("focus_camera"), target: Id.optional(), position: Pos.optional(), zoom: z.enum(["close", "medium", "wide"]).optional() }),
  z.object({ op: z.literal("set_camera"), preset: z.enum(["iso", "top", "front", "side"]) }),
  z.object({
    op: z.literal("spawn_character"),
    id: Id,
    character: z.enum(CHARACTER_KINDS),
    position: Pos,
    name: Text(20),
    color: Color.optional(),
  }),
  z.object({ op: z.literal("animate_character"), id: Id, animation: z.enum(ANIMATIONS) }),
  z.object({ op: z.literal("walk_character"), id: Id, position: Pos }),
  z.object({
    op: z.literal("speak"),
    speaker: Id.or(z.literal("narrator")),
    text: Text(LIMITS.maxSpeakChars).describe("one or two short sentences; may use {{range}}, {{flight_time}}, {{max_height}}, {{speed}}, {{angle}}, {{gravity}}, {{impact_speed}}"),
    emotion: z.enum(["happy", "curious", "excited", "calm", "surprised"]).optional(),
  }),
  z.object({ op: z.literal("wait"), ms: num(0, 8000) }),
  z.object({ op: z.literal("wait_for"), event: z.enum(["projectile_landed", "objects_settled"]), timeoutMs: num(500, 15000).optional() }),
  z.object({
    op: z.literal("ask_question"),
    question: Text(160),
    choices: z.array(Text(60)).min(2).max(4),
    answerIndex: z.number().int().min(0).max(3),
    explanation: Text(240),
  }),
  z.object({
    op: z.literal("spawn_shape"),
    id: Id,
    shape: z.enum(SHAPE_KINDS),
    size: z.array(num(0.02, 12)).length(3).describe("[width, height, depth] m; tube/line/arrow use size[0] as thickness"),
    position: Pos,
    rotation: vec3(360).optional().describe("degrees"),
    color: Color,
    opacity: num(0.1, 1).optional(),
    glow: z.boolean().optional(),
    wireframe: z.boolean().optional(),
    sides: z.number().int().min(3).max(12).optional().describe("prism sides"),
    points: z.array(z.array(num(-20, 20)).length(2)).min(3).max(48).optional().describe("extrusion: 2D outline [x, y] m; lathe: profile [radius, height] m"),
    path: z.array(vec3(20)).min(2).max(48).optional().describe("tube/line/arrow: points relative to position; arrow uses the first two"),
    physics: Physics.optional(),
    material: z.enum(MATERIAL_IDS).optional(),
    label: Text(40).optional(),
  }),
  z.object({
    op: z.literal("morph_shape"),
    id: Id,
    size: z.array(num(0.02, 12)).length(3).optional(),
    position: Pos.optional(),
    rotation: vec3(360).optional(),
    color: Color.optional(),
    opacity: num(0.1, 1).optional(),
    sides: z.number().int().min(3).max(12).optional(),
    durationMs: num(100, 8000).optional(),
  }),
  z.object({
    op: z.literal("show_orbits"),
    mode: z.enum(["solar_system", "earth_moon", "seasons"]),
    planets: z.array(z.enum(PLANET_IDS)).max(8).optional().describe("default: all eight"),
    focus: z.enum([...PLANET_IDS, "sun", "moon"]).optional(),
    daysPerSecond: num(0, 400).optional().describe("simulation speed; 0 pauses"),
    labels: z.boolean().optional(),
  }),
  z.object({ op: z.literal("set_fluid"), fluid: z.enum(FLUID_IDS) }),
  z.object({
    op: z.literal("set_environment"),
    preset: z.enum(ENV_PRESETS).optional().describe("replaces the whole look; other fields fine-tune it"),
    sky: Color.nullable().optional().describe("background colour; null = normal daylight backdrop"),
    ground: Color.nullable().optional().describe("outdoor ground colour around the play area"),
    surface: Color.nullable().optional().describe("colour of painted play surfaces (court lanes); measuring lines stay"),
    light: z.enum(LIGHTS).optional(),
    fog: Color.nullable().optional(),
    scenery: z.boolean().optional().describe("false hides trees, benches, lamps and signs"),
    stars: z.boolean().optional(),
    earth: z.boolean().optional().describe("show Earth hanging in the sky"),
    craters: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("set_module"),
    module: z.enum(MODULE_NAMES),
    set: z
      .record(z.string(), z.unknown())
      .describe(
        "only the fields to change. orbits: mode, planets, focus, daysPerSecond, labels, distances ({planet: AU} moves planets to new orbits, e.g. {earth: 30.07, neptune: 1} swaps them; {} puts every planet back). fluid: fluid. circuit: layout, voltage, bulbs, resistanceOhms, switchClosed, brokenBulbs (1-based bulb numbers that are blown; [] fixes them all). wave: kind, amplitude, frequency, wavelength. lever: leftMassKg, leftDistanceM, rightMassKg, rightDistanceM. particles: substance, temperatureC. cell: kind, highlight (part or null). globe: view, spin, focus (place id or null). ripple: frequencyHz, depthM, source, separationM, barrier, gapWidthM, barrierX, reflectorAngleDeg, shallow, shallowDepthM, sourceSpeed, view, amplitude. signal: kind, soundHz, layout (resets the walls), walls ([{id, from:[x,z], to:[x,z], material}] replaces all), allWalls (one material for every wall), source [x,z], device [x,z], view. optics: sourceKind (laser|ray_box|lamp|off), sourcePosition [x,z], angleDeg, color, rays, spread (ray_box width m / lamp fan degrees), aimAt (element id or null), medium (air|water), normals, object ({target: lens or curved mirror id, distanceM, heightM} or null), mixing ({red, green, blue} spotlights or null)",
      ),
  }),
  z.object({
    op: z.literal("plot_function"),
    id: Id,
    expression: Text(100).describe("in x only, e.g. x^2 - 3, 2x + 1, sin(x), sqrt(x)"),
    xMin: num(-50, 50).optional(),
    xMax: num(-50, 50).optional(),
    color: Color.optional(),
    label: Text(30).optional(),
  }),
  z.object({ op: z.literal("plot_point"), id: Id, x: num(-50, 50), y: num(-50, 50), label: Text(30).optional(), color: Color.optional() }),
  z.object({ op: z.literal("plot_vector"), id: Id, from: z.array(num(-20, 20)).length(2), to: z.array(num(-20, 20)).length(2), label: Text(30).optional(), color: Color.optional() }),
  z.object({ op: z.literal("clear_plot") }),
  z.object({
    op: z.literal("build_circuit"),
    layout: z.enum(["series", "parallel"]),
    voltage: num(0, 24),
    bulbs: z.number().int().min(1).max(4),
    resistanceOhms: num(1, 100).optional().describe("per bulb, default 10"),
    switchClosed: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("show_wave"),
    kind: z.enum(["transverse", "longitudinal"]),
    amplitude: num(0.05, 1.2),
    frequency: num(0.1, 4),
    wavelength: num(0.5, 6),
  }),
  z.object({
    op: z.literal("build_lever"),
    leftMassKg: num(0.1, 50),
    leftDistanceM: num(0.1, 2.4),
    rightMassKg: num(0.1, 50),
    rightDistanceM: num(0.1, 2.4),
  }),
  z.object({ op: z.literal("show_particles"), substance: z.enum(SUBSTANCE_IDS), temperatureC: num(-273, 3500) }),
  z.object({ op: z.literal("show_cell"), kind: z.enum(CELL_KINDS), highlight: z.enum(Object.keys(ORGANELLES) as [string, ...string[]]).optional() }),
  z.object({ op: z.literal("show_globe"), view: z.enum(["globe", "map"]), spin: z.boolean().optional(), focus: z.enum(PLACE_IDS).optional() }),
  z.object({
    op: z.literal("mark_place"),
    id: Id,
    place: z.enum(PLACE_IDS).optional().describe("prefer a curated place"),
    lat: num(-90, 90).optional(),
    lon: num(-180, 180).optional(),
    label: Text(40).optional(),
    color: Color.optional(),
  }),
  z.object({ op: z.literal("connect_places"), id: Id, from: Id, to: Id }),
  z.object({
    op: z.literal("show_ripple_tank"),
    windSpeedMps: num(0, 20).optional().describe("qualitative wind driver; zero = calm. Stronger driver creates larger ripples, not an ocean wave-height forecast"),
    source: z.enum(RIPPLE_SOURCES).optional().describe("point = one dipper; two_point = two dippers in step (interference); plane = a straight bar (straight waves)"),
    frequencyHz: num(0.3, 3).optional(),
    depthM: num(0.02, 0.5).optional().describe("water depth; shallower water makes slower, shorter waves"),
    barrier: z.enum(RIPPLE_BARRIERS).optional().describe("wall reflects; gap and double_slit make diffraction; reflector is an angled flat barrier"),
    gapWidthM: num(0.05, 1).optional(),
    separationM: num(0.1, 1.2).optional().describe("two_point: distance between the dippers"),
    shallow: z.boolean().optional().describe("a glass plate makes the far half shallow: waves slow down and bend (refraction)"),
    sourceSpeed: num(0, 0.5).optional().describe("m/s; a moving dipper shows the Doppler effect"),
    view: z.enum(["waves", "intensity"]).optional().describe("intensity shows where waves add up and where they cancel"),
  }),
  z.object({
    op: z.literal("show_signal"),
    kind: z.enum(SIGNAL_KIND_IDS),
    layout: z.enum(SIGNAL_LAYOUTS).optional().describe("floor plan; default apartment"),
    source: z.array(num(-PLAN.x, PLAN.x)).length(2).optional().describe("[x, z] of the router, speaker, mast or lamp (x -3.6..3.6, z -2.6..2.6)"),
    device: z.array(num(-PLAN.x, PLAN.x)).length(2).optional().describe("[x, z] of the phone, radio or listener"),
    soundHz: num(50, 8000).optional().describe("pitch for kind sound"),
    view: z.enum(["both", "waves", "strength"]).optional().describe("waves = the moving wave fronts; strength = a coloured map of signal strength"),
  }),
  z.object({
    op: z.literal("show_optics"),
    preset: z.enum(OPTIC_PRESETS),
    color: z.enum(LIGHT_COLOR_IDS).optional().describe("white splits into a rainbow in a prism"),
    angleDeg: num(-360, 360).optional().describe("beam direction on the table (0 = +x, 90 = +z); aimed presets keep pointing at their element"),
    material: z.enum(OPTIC_MATERIAL_IDS).optional().describe("for the blocks, prisms and semicircles"),
  }),
  z.object({
    op: z.literal("place_optic"),
    id: Id,
    element: z.enum(OPTIC_KINDS),
    position: z.array(num(-TABLE.x, TABLE.x)).length(2).describe("[x, z] on the table (x -2.8..2.8, z -1.6..1.6); an existing id moves that element"),
    rotationDeg: num(-360, 360).optional().describe("0 = its axis (or normal) along +x"),
    sizeM: num(0.2, 4.8).optional().describe("length across its face"),
    widthM: num(0.1, 2).optional().describe("glass_block thickness along its axis"),
    focalLengthM: num(0.2, 3).optional(),
    material: z.enum(OPTIC_MATERIAL_IDS).optional(),
  }),
  z.object({ op: z.literal("remove_optic"), id: Id }),
  z.object({
    op: z.literal("show_card"),
    id: Id,
    title: Text(60),
    subtitle: z.string().max(90).optional(),
    rows: z.array(z.object({ label: Text(40), value: Text(70) })).max(6).optional().describe("label/value pairs; values may use {{placeholders}}"),
    bullets: z.array(Text(160)).max(5).optional(),
    placement: z.enum(["center", "object"]).optional().describe("center = middle of the screen; object = floating next to target in the world"),
    target: Id.optional(),
    tone: z.enum(["info", "fact", "warning", "question"]).optional(),
    durationMs: num(0, 60000).optional().describe("0 or omitted = stays until hide_card or the next lesson"),
  }),
  z.object({ op: z.literal("hide_card"), id: Id.or(z.literal("all")) }),
  z.object({ op: z.literal("build_molecule"), id: Id, molecule: z.enum(MOLECULE_IDS), position: Pos.optional() }),
  z.object({ op: z.literal("build_atom"), id: Id, element: z.enum(ELEMENT_SYMBOLS), position: Pos.optional() }),
]);
export type Command = z.infer<typeof Command>;
export type Op = Command["op"];

export const Step = z.object({
  title: Text(60),
  commands: z.array(Command).max(LIMITS.maxCommands),
});
export type Step = z.infer<typeof Step>;

export const CAPABILITIES = ["gravity", "projectile", "molecule", "atom", "orbits", "buoyancy", "graph", "geometry", "circuit", "waves", "lever", "matter", "cell", "globe", "concept", "none", "light", "signal", "mechanics", "maths"] as const;
export type CapabilityId = (typeof CAPABILITIES)[number];

export const ScenePlan = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  scope: z.enum(["in_scope", "too_advanced", "off_topic", "unsafe", "needs_clarification"]),
  language: z.enum(["en", "id"]),
  title: Text(60),
  question: Text(70).optional().describe("the student's question boiled down to its main point, shown at the top of the screen"),
  subject: z.enum(["physics", "chemistry", "biology", "math", "earth_space", "general_science", "other"]),
  supportLevel: z.enum(["simulated", "visual", "text"]),
  capability: z.enum(CAPABILITIES),
  reply: Text(500).describe("short friendly answer shown in the explanation card"),
  details: z.string().max(1500).optional().describe("longer explanation for 'show more'"),
  steps: z.array(Step).max(LIMITS.maxSteps),
  assumptions: z.array(Text(120)).max(5),
  limitations: z.array(Text(160)).max(4),
  followUps: z.array(Text(70)).max(4),
});
export type ScenePlan = z.infer<typeof ScenePlan>;

/** Envelope with commands left unparsed, so one bad command doesn't sink the plan. */
export const LoosePlan = ScenePlan.extend({
  steps: z.array(z.object({ title: Text(60), commands: z.array(z.unknown()).max(LIMITS.maxCommands * 2) })).max(LIMITS.maxSteps),
});

export interface PlanIssue {
  step: number;
  index: number;
  op: string;
  message: string;
}

/** Compact snapshot of the scene the client sends with follow-up prompts. */
export const SceneSnapshot = z.object({
  world: z.enum(WORLD_IDS),
  /** Customized map instance ids, used when the director changes worlds. */
  layouts: z.array(z.object({ world: z.enum(WORLD_IDS), ids: z.array(Id).max(LIMITS.maxObjects) })).max(WORLD_IDS.length).optional(),
  gravity: z.array(z.number()).length(3),
  capability: z.enum(CAPABILITIES).optional(),
  projectile: z
    .object({ speed: z.number(), angleDeg: z.number(), gravity: z.number(), height: z.number(), range: z.number().nullable(), flightTime: z.number().nullable(), maxHeight: z.number().nullable() })
    .optional(),
  objects: z
    .array(z.object({ id: z.string().max(32), kind: z.string().max(32), label: z.string().max(40).optional(), position: z.array(z.number()).length(3), physics: z.string().max(10), learnerPlaced: z.boolean().optional() }))
    .max(60),
  characters: z.array(z.object({ id: z.string().max(32), kind: z.string().max(16), name: z.string().max(20) })).max(8),
  selected: z.string().max(32).nullable().optional(),
  /** Active science modules and their parameters (small, engine-defined). */
  modules: z.record(z.string().max(20), z.unknown()).optional(),
  /** Current restyle of the world, if any. */
  environment: z.record(z.string().max(20), z.unknown()).optional(),
});
export type SceneSnapshot = z.infer<typeof SceneSnapshot>;

export const ChatTurn = z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(1200) });

export const PlanRequest = z.object({
  prompt: z.string().trim().min(1).max(LIMITS.maxPromptChars),
  scene: SceneSnapshot,
  history: z.array(ChatTurn).max(8),
  gradeBand: z.enum(["elementary", "middle", "high"]).default("middle"),
  language: z.enum(["auto", "en", "id"]).default("auto"),
});
export type PlanRequest = z.infer<typeof PlanRequest>;
