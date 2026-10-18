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
    keywords: /gravit|weightless|zero.?g|fall|drop|bounce|weight|gravitasi|jatuh|melayang|berat/i,
  },
  {
    id: "projectile",
    name: "Projectile motion court",
    world: "court",
    support: "simulated",
    summary:
      "Analytic projectile engine on the court: launch_projectile with speed+unit, angle, gravity, launch height. Exact range, flight time, max height, impact speed are computed by the engine; reference them only with {{placeholders}} and show_measurement.",
    keywords: /throw|projectile|trajector|kick|shoot|cannon|lempar|tembak|lintasan|how far.*(ball|throw)|launch.*(ball|projectile)/i,
  },
  {
    id: "molecule",
    name: "Molecule viewer",
    world: "lab",
    support: "simulated",
    summary:
      "Verified ball-and-stick models with real bond angles and lone pairs: build_molecule with H2O, CO2, CH4, NH3, O2, N2, H2, HCl. Bond angle labels are drawn automatically from curated data.",
    keywords: /molecul|h2o|water molecule|co2|carbon dioxide|methane|ch4|ammonia|nh3|bond|oxygen gas|nitrogen gas|hydrogen gas|hcl|polar|molekul|ikatan/i,
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
    keywords: /ripple|\bwaves?\b|water wave|ocean.*wave|wave.*ocean|sea.*wave|wave.*sea|wind.*water|wind.*ocean|wave pool|tsunami|wavelength|frequency|interference|diffraction|doppler|amplitude|gelombang|ombak|riak|panjang gelombang|frekuensi/i,
  },
  { id: "mechanics", name: "Mechanics Lab", world: "mechanics", support: "simulated", summary: "show_mechanics: instrumented 1D force/acceleration/friction, elastic/inelastic collisions, impulse, ramp, Hooke spring and small-angle pendulum experiments. Exact SI readouts and set_module mechanics controls.", keywords: /newton|momentum|accelera|decelera|inertia|\bforce\b|\bforces\b|\bpush\b|\bpull\b|collision|friction|impulse|\bmass\b|\binclined\b|\bramp\b|pendulum|\bspring\b|kinetic|work.?energy|gaya|percepatan|perlambatan|tumbukan|gesekan|pegas|bandul|inersia/i },
  { id: "maths", name: "Math Studio", world: "math_studio", support: "simulated", summary: "show_math: number lines, arithmetic, fraction operations, ratio/percent, equations/inequalities/quadratics/systems, functions, 2D/3D geometry, trig, statistics, probability, sequences and transformations. Engine-computed worked examples; plot_function and spawn_shape also supported.", keywords: /one half|one third|halves|thirds|sixths|place value|measurement|convert.*unit|\bangles?\b|\bmath|arithmeti|fraction|decimal|percent|ratio|proportion|equation|inequal|quadratic|algebra|\bsolve\b|simultaneous|trigono|sine|cosine|tangent|pythag|statistic|probabil|median|\bmean of\b|average|variance|sequence|\bcount\b|number line|multipli|divis|addition|subtract|\bgraph\b|\bfunction\b|geometry|perimeter|\barea\b|\bvolume\b|symmetr|reflect.*axis|rotate.*origin|pecahan|persen|perbandingan|persamaan|pertidaksamaan|peluang|rata.rata|barisan|deret|matematika|penjumlahan|pengurangan|perkalian|pembagian|luas|keliling|bentuk/i },
  { id: "orbits", name: "Orbital observatory", world: "space", support: "simulated", summary: "show_orbits: all eight planets, planet periods, Earth/Moon phases, seasons and changing orbital distances.", keywords: /planet|orbit|solar system|moon phase|season|day and night|tata surya|fase bulan|musim|\b(?:mercury|venus|mars|jupiter|saturn|uranus|neptune)\b|(?:draw|show|compare).{0,30}\bearth\b/i },
  { id: "buoyancy", name: "Buoyancy tank", world: "ocean", support: "simulated", summary: "set_fluid and real density/material objects for float/sink comparisons.", keywords: /buoyan|float|sink|density|archimedes|flotation|apung|tenggelam|massa jenis/i },
  { id: "circuit", name: "Circuit workbench", world: "workshop", support: "simulated", summary: "build_circuit series/parallel; set_module circuit for voltage, resistance and broken bulbs.", keywords: /circuit|electric|ohm|resistan|\bvoltage\b|electric current|battery|bulb|rangkaian|listrik|tegangan|hambatan|lampu/i },
  { id: "lever", name: "Lever balance", world: "workshop", support: "simulated", summary: "build_lever for torque balance with mass and arm length.", keywords: /\blever\b|torque|seesaw|fulcrum|tuas|jungkat|torsi/i },
  { id: "matter", name: "Particle box", world: "lab", support: "visual", summary: "show_particles for temperature and phase of matter; a labelled particle model.", keywords: /state.*matter|solid.*liquid|melt|boil|freez|particle|gas.*temperature|wujud|mencair|membeku|mendidih|partikel/i },
  { id: "cell", name: "Cell models", world: "lab", support: "visual", summary: "show_cell animal/plant/bacteria; highlight organelles.", keywords: /\bcell\b|organel|mitoch|chloroplast|bacteria|\bsel\b|kloroplas|mitokondria/i },
  { id: "globe", name: "Earth and map", world: "globe", support: "simulated", summary: "show_globe, mark_place and connect_places for geography and great-circle distances.", keywords: /countr|geograph|continent|latitude|longitude|time zone|distance.*(london|tokyo|jakarta)|negara|benua|lintang|bujur|zona waktu/i },
];

export function matchCapabilities(prompt: string): CapabilityId[] {
  const priority: Partial<Record<CapabilityId, number>> = { mechanics: 105, maths: 95, waves: 100, signal: 105, light: 110, projectile: 115, atom: 85, molecule: 85, orbits: 80, buoyancy: 80, circuit: 85, lever: 85, matter: 85, cell: 85, globe: 85, gravity: 60, concept: 1 };
  const gravityWhatIf = /(?:no|zero|without|remove|disappear|off|10\s*[x×]|ten times|stronger|weaker).{0,25}gravit|gravit.{0,25}(?:off|disappear|zero|10\s*[x×]|ten times|stronger|weaker)|gravitasi.{0,20}(hilang|nol|10|sepuluh)|tanpa gravitasi/i.test(prompt);
  const numericMath = /(?:\d\s*[+*/^=]\s*\d)|\b\d+\s+(?:plus|minus|times|divided by)\s+\d+/i.test(prompt);
  const dynamics = /newton|momentum|accelera|decelera|collision|impulse|percepatan|tumbukan/i.test(prompt);
  const waterPhysics = /(?:\bocean\b|\bwater\b|\bsea\b|\bripples?\b|ombak|riak|gelombang air)/i.test(prompt) && /wave|wind|gelombang|ombak|riak|angin|ripple|diffraction|interference/i.test(prompt);
  return CAPABILITY_DEFS.filter(c => c.keywords.test(prompt) || (c.id === "maths" && numericMath)).map(c => ({ id: c.id, score: (priority[c.id] ?? 20) + (c.id === "gravity" && gravityWhatIf ? 70 : 0) + (c.id === "mechanics" && dynamics ? 40 : 0) + (c.id === "waves" && waterPhysics ? 50 : 0) }))
    .sort((a, b) => b.score - a.score).map(c => c.id);
}
