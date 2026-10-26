import { CAPABILITY_DEFS, matchCapabilities } from "./capabilities";
import type { CapabilityId, Command, PlanRequest, ScenePlan } from "../ssp/schema";
import type { WorldId } from "../world/catalog";

export interface TeachingChoice { capability: CapabilityId; world: WorldId | null; reason: string; required: Command["op"][]; enforce: boolean; active: boolean; instrument?: string; wind: boolean; activeWind: boolean }
const waterWords = /ocean|sea\b|water|ripple|tsunami|wind|gelombang air|ombak|laut|angin|riak/i;
const operations: Partial<Record<CapabilityId, Command["op"][]>> = {
  anatomy: ["show_anatomy"], mechanics: ["show_mechanics"], maths: ["show_math", "plot_function", "plot_point", "plot_vector", "spawn_shape"],
  circuit: ["build_circuit", "show_circuit", "place_part", "set_part"], magnetism: ["show_magnets", "place_magnet"], lever: ["build_lever"], light: ["show_optics", "place_optic"],
  orbits: ["show_orbits"], buoyancy: ["set_fluid", "spawn_asset", "spawn_shape"], cell: ["show_cell"], matter: ["show_particles"], reaction: ["show_reaction"], population: ["show_population"], genetics: ["show_genetics"], osmosis: ["show_osmosis"],
};
const moduleFor: Partial<Record<CapabilityId, string>> = { anatomy: "anatomy", mechanics: "mechanics", maths: "maths", waves: "ripple", circuit: "circuit", lever: "lever", light: "optics", orbits: "orbits", buoyancy: "fluid", cell: "cell", matter: "particles", reaction: "reaction", population: "population", genetics: "genetics", osmosis: "osmosis" };

export function isParameterFollowUp(prompt: string, capability?: string): boolean {
  if (!/^(?:please\s+)?(?:now\s+)?(?:change|set|increase|decrease|double|halve|make|turn|ubah|naikkan|turunkan)\b/i.test(prompt)) return false;
  const parameters: Partial<Record<string, RegExp>> = {
    projectile: /angle|speed|gravity|height|ball|sudut|kecepatan|gravitasi/i,
    anatomy: /heart rate|pulse|resistance|stiff|contractil|filling|breath|effort|airway|compliance|fibre|fiber|stimulus|hours|layer|skin|muscle|skeleton|organ|label|slow|speed|denyut|napas/i,
    mechanics: /mass|force|friction|velocity|speed|gravity|restitution|spring|length|duration|angle|massa|gaya|gesekan/i,
    waves: /wind|frequency|depth|amplitude|gap|source|barrier|angin|frekuensi/i,
    maths: /numerator|denominator|coefficient|angle|data|unit|term|value|expression/i,
    graph: /coefficient|expression|range|color/i,
    light: /angle|color|colour|wavelength|medium|lens|mirror|ray|distance/i,
    circuit: /voltage|resistance|bulb|switch/i,
    orbits: /distance|speed|orbit|planet|year/i,
  };
  return !!capability && !!parameters[capability]?.test(prompt);
}

const POINTING = /\b(this|that|these|those|it|its|here|there|ini|itu|tersebut|sini|situ)\b/i;

/**
 * A short, vague question asked right after the student clicked something
 * ("what is this for?") is about that thing, so routing treats it as if it
 * named it. The student's own words still go to the model unchanged.
 */
export function routedPrompt(req: Pick<PlanRequest, "prompt" | "scene">): string {
  const f = req.scene.focus;
  if (!f || f.secondsAgo > 300 || req.prompt.trim().split(/\s+/).length > 16 || !POINTING.test(req.prompt)) return req.prompt;
  return `${req.prompt} (about: ${f.label})`;
}

export function chooseTeaching(req: Pick<PlanRequest, "prompt" | "scene" | "history">): TeachingChoice {
  const prompt = req.prompt.trim(), hits = matchCapabilities(prompt);
  const current = req.scene.capability;
  let capability: CapabilityId = hits[0] ?? "concept";
  const adjustment = /^(now|and|what if|how about|what about|make|turn|set|change|increase|decrease|double|halve|try|coba|ubah|bagaimana kalau)\b/i.test(prompt) && prompt.split(/\s+/).length <= 18;
  // Parameter tweaks stay in a working experiment; an explicit new subject still wins.
  const gravityTweak = /gravity|gravitasi/i.test(prompt) && ["mechanics", "projectile"].includes(current ?? "") && !/bedroom|kamar/i.test(prompt);
  const keep = Boolean(req.history.length && current && adjustment && (!hits.length || capability === current || gravityTweak || isParameterFollowUp(prompt, current)));
  if (keep) capability = current!;
  const def = CAPABILITY_DEFS.find(c => c.id === capability);
  let world = keep ? req.scene.world : def?.world ?? null;
  const explicitStage = /(?:in|on|use|using|di|pakai) (?:the )?(?:blank |idea )?stage|without (?:a )?simulation|just (?:a )?diagram/i.test(prompt);
  if (explicitStage) world = "stage";
  const explicitBedroom = /(?:in|use|using|di|pakai) (?:the |my )?(?:bedroom|kamar)/i.test(prompt);
  if (explicitBedroom && ["mechanics", "gravity"].includes(capability)) { world = "bedroom"; capability = "gravity"; }
  const required = capability === "waves" ? (waterWords.test(prompt) || req.scene.modules?.ripple ? ["show_ripple_tank" as const] : ["show_wave" as const]) : operations[capability] ?? [];
  const moduleName = capability === "waves" && required.includes("show_wave") ? "wave" : moduleFor[capability];
  const active = world === req.scene.world && !!moduleName && req.scene.modules?.[moduleName] != null;
  const mechanicsMode = /pendulum|bandul/i.test(prompt) ? "pendulum" : /spring|hooke|pegas/i.test(prompt) ? "spring" : /incline|ramp|bidang miring/i.test(prompt) ? "ramp" : /impulse|contact time|impuls/i.test(prompt) ? "impulse" : /collision|momentum|tumbukan/i.test(prompt) ? "collision" : "force";
  const mathModes: [RegExp, string][] = [
    [/fraction|one half|one third|halves|thirds|sixths|pecahan/i, "fractions"], [/probabil|chance|peluang/i, "probability"],
    [/statistic|\bmean of\b|median|\bmode of\b|variance|average|rata.rata/i, "statistics"], [/place value|nilai tempat/i, "place_value"],
    [/conver|measurement|satuan/i, "measurement"], [/percent|persen/i, "percent"], [/ratio|proportion|perbandingan/i, "ratio"],
    [/inequal|pertidaksamaan/i, "inequality"], [/quadratic|x\s*[²^]\s*2?|kuadrat/i, "quadratic"], [/simultaneous|system of|two equations|sistem persamaan/i, "linear_system"],
    [/equation|\bsolve\b|persamaan/i, "equation"], [/sequence|barisan|deret/i, "sequence"], [/graph|function|grafik|fungsi/i, "functions"],
    [/sine|cosine|tangent|trigono/i, "trigonometry"], [/transform|reflect.*axis|rotate.*origin/i, "transform"],
    [/geometry|area|volume|perimeter|luas|keliling/i, "geometry"], [/angle|sudut/i, "angles"], [/number line|garis bilangan/i, "number_line"],
  ];
  const anatomyModel = /heart|pulse|blood|circulat|beat|jantung|darah|denyut/i.test(prompt) ? "heart" : /breath|lung|air|oxygen|inhale|exhale|respir|asthma|napas|paru|oksigen/i.test(prompt) ? "breathing" : /nerve|reflex|neuron|brain|feel|touch|pain|senses?|knee|taps?b|saraf|otak|refleks|lutut/i.test(prompt) ? "nerve" : /eat|food|meal|digest|stomach|intestin|swallow|chew|poo|liver|makan|cerna|lambung|usus/i.test(prompt) ? "digestion" : /kidney|urine|pee|bladder|drink|water|ginjal|kencing|minum/i.test(prompt) ? "kidney" : "none";
  const currentModule = moduleName ? req.scene.modules?.[moduleName] as { mode?: string } | undefined : undefined;
  const instrument = keep && currentModule?.mode ? currentModule.mode : capability === "mechanics" ? mechanicsMode : capability === "maths" ? mathModes.find(([pattern]) => pattern.test(prompt))?.[1] ?? "arithmetic" : capability === "waves" ? required[0] : capability === "anatomy" ? anatomyModel : undefined;
  const wind = capability === "waves" && /wind|angin/i.test(prompt);
  const activeWind = active && (req.scene.modules?.ripple as { windSpeed?: number } | undefined)?.windSpeed !== undefined;
  return { capability, world, required, active, instrument, wind, activeWind, enforce: !explicitStage && required.length > 0,
    reason: keep ? "Preserve the active experiment for this parameter follow-up." : explicitStage ? "The student explicitly requested an illustration/stage." : `${def?.name ?? "Illustration"} provides the closest existing teaching tools; prefer a working model over an invented diagram.` };
}

/** Do not play an avoidable blank-stage answer before the one repair attempt can fix it. */
export function teachingPlanIssue(plan: Pick<ScenePlan, "scope" | "capability" | "steps">, choice: TeachingChoice): string | null {
  if (!choice.enforce || plan.scope !== "in_scope") return null;
  const commands = plan.steps.flatMap(step => step.commands);
  const moduleName = choice.capability === "waves" && choice.required.includes("show_wave") ? "wave" : moduleFor[choice.capability];
  const operates = commands.some(c => choice.required.includes(c.op) || (c.op === "set_module" && c.module === moduleName));
  if (!operates && !choice.active) return `Use ${choice.required.join(" or ")} (or set_module ${moduleName}) in ${choice.world}; an available native experiment must not be replaced by a blank-stage diagram.`;
  if (choice.wind && !choice.activeWind && !commands.some(c => (c.op === "show_ripple_tank" && c.windSpeedMps !== undefined) || (c.op === "set_module" && c.module === "ripple" && typeof c.set.windSpeedMps === "number"))) return "Use the ripple tank's windSpeedMps driver for the requested wind comparison, and label its qualitative limits.";
  if (choice.world && commands.some(c => c.op === "load_world" && c.world !== choice.world)) return `Keep this focused experiment in ${choice.world}; remove unrelated world loads.`;
  return null;
}
