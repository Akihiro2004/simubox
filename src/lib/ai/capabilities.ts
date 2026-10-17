// Capability registry + deterministic keyword matcher. The matcher gives
// Gemini a hint and picks offline demo fixtures; Gemini makes the final call.

import type { CapabilityId } from "../ssp/schema";
import type { WorldId } from "../world/catalog";

export interface CapabilityDef {
  id: CapabilityId;
  name: string;
  world: WorldId | null;
  support: "simulated" | "visual" | "text";
  summary: string;
  keywords: RegExp;
}

export const CAPABILITY_DEFS: CapabilityDef[] = [
  {
    id: "gravity",
    name: "Gravity & forces room",
    world: "bedroom",
    support: "simulated",
    summary:
      "Real rigid-body physics (Rapier) in the bedroom. Change gravity (set_gravity / set_parameter gravity), push objects (apply_impulse, apply_force, set_velocity), spawn props, compare masses, drag/drop. Objects at rest stay at rest in zero gravity until something pushes them.",
    keywords: /gravit|weightless|zero.?g|float|fall|drop|newton|inertia|force|push|pull|collision|bounce|friction|mass|weight|moon|mars|jupiter|gravitasi|jatuh|melayang|gaya|dorong|massa|berat/i,
  },
  {
    id: "projectile",
    name: "Projectile motion court",
    world: "court",
    support: "simulated",
    summary:
      "Analytic projectile engine on the court: launch_projectile with speed+unit, angle, gravity, launch height. Exact range, flight time, max height, impact speed are computed by the engine; reference them only with {{placeholders}} and show_measurement.",
    keywords: /throw|launch|projectile|trajector|angle|degree|kick|shoot|cannon|parabola|range|how far|lempar|tembak|sudut|derajat|lintasan|parabola|seberapa jauh/i,
  },
  {
    id: "molecule",
    name: "Molecule viewer",
    world: "lab",
    support: "simulated",
    summary:
      "Verified ball-and-stick models with real bond angles and lone pairs: build_molecule with H2O, CO2, CH4, NH3, O2, N2, H2, HCl. Bond angle labels are drawn automatically from curated data.",
    keywords: /molecul|h2o|water molecule|co2|carbon dioxide|methane|ch4|ammonia|nh3|bond|oxygen gas|nitrogen gas|hydrogen gas|hcl|polar|molekul|ikatan|air\b/i,
  },
  {
    id: "atom",
    name: "Atom model",
    world: "lab",
    support: "visual",
    summary:
      "The lab wall has a full 118-element periodic table: show_periodic_table faces it, highlights atomic numbers/groups/periods and draws arrows/circles/notes on it. Use it for periodic-table questions. Separate schematic Bohr atoms support elements 1-20 only (build_atom); they are simplified models.",
    keywords: /atom|electron|proton|neutron|nucleus|shell|element|periodic|tabel periodik|unsur|halogen|noble gas|alkali|elektron|inti/i,
  },
  {
    id: "concept",
    name: "Illustrated scene",
    world: null,
    support: "visual",
    summary:
      "Build an illustrated explanation in any world from catalog assets, primitives, characters, labels and arrows (e.g. photosynthesis with plant, sun and labelled arrows). It is an illustration, not a simulation: set supportLevel 'visual'.",
    keywords: /photosynth|plant|cell|water cycle|rain|evaporat|solar system|planet|orbit|season|day and night|circuit|electric|magnet|food chain|ecosystem|fraction|geometry|shape|volume|area|fotosintesis|tumbuhan|siklus|tata surya|listrik/i,
  },
  {
    id: "light",
    name: "Light Lab optics table",
    world: "optics",
    support: "simulated",
    summary:
      "Geometric optics in a bright Light Lab: reflection, Snell refraction, Fresnel power, total internal reflection, dispersion, plane-mirror images, ideal thin lenses and spherical mirrors (paraxial image prediction). Set exact wavelength, source distance, ray count, elements, room lighting and RGB projection. Engine readouts include screen power and reflectance. show_optics, set_module optics, place_optic/remove_optic.",
    keywords: /reflect|mirror|refract|lens|prism|rainbow|laser|periscope|total internal|optic|fibre|fiber|light ray|ray of light|beam of light|shadow|colou?r of light|mix(ing)? colou?r|magnif|focal|bent straw|pantul|cermin|bias|lensa|prisma|pelangi|bayangan|cahaya/i,
  },
  {
    id: "signal",
    name: "Signal floor plan",
    world: "stage",
    support: "simulated",
    summary:
      "show_signal: Wi-Fi, Bluetooth, 4G/5G, FM/AM radio, sound or light spreading through a floor plan with walls of different materials. Real strength map (path loss plus per-wall loss) and a wave simulation of the fronts (reflections, shadows, doorways).",
    keywords: /wi-?fi|signal|router|bluetooth|\b[45]g\b|radio wave|antenna|reception|dead zone|microwave|electromagnetic|sinyal|gelombang radio|jaringan/i,
  },
  {
    id: "waves",
    name: "Ripple tank and wave rope",
    world: "workshop",
    support: "simulated",
    summary:
      "show_ripple_tank: real water waves (speed and wavelength from frequency and depth), interference from two dippers, diffraction through gaps, reflection, refraction over a shallow plate, Doppler effect. show_wave: a rope wave with v = f × λ.",
    keywords: /ripple|water wave|ocean wave|wave pool|tsunami|wavelength|frequency|interference|diffraction|doppler|amplitude|gelombang air|riak|panjang gelombang|frekuensi/i,
  },
];

export function matchCapabilities(prompt: string): CapabilityId[] {
  const hits = CAPABILITY_DEFS.filter((c) => c.keywords.test(prompt)).map((c) => c.id);
  // Projectile wording ("throw at 40 degrees") is more specific than gravity's.
  if (hits.includes("projectile")) return ["projectile", ...hits.filter((h) => h !== "projectile")];
  return hits;
}
