// Turns untrusted model output into a safe ScenePlan: schema-check the
// envelope, then each command on its own (invalid ones are dropped and
// reported), then semantic checks against the current scene.

import { GUIDE_ID, LIMITS, type WorldId } from "../world/catalog";
import { initialObjects } from "../world/scene";
import { PROJECTILE_LIMITS, toMetersPerSecond } from "../engine/projectile";
import { ARG_PLACEHOLDERS, Command, LoosePlan, PLACEHOLDERS, ScenePlan, type PlanIssue, type SceneSnapshot } from "./schema";
import { PLANET_IDS } from "../engine/astro";
import { PLACE_IDS } from "../engine/geo";
import { isValidExpression } from "../engine/expr";

export type ValidationResult =
  | { ok: true; plan: ScenePlan; issues: PlanIssue[] }
  | { ok: false; error: string };

const PLACEHOLDER_RE = /\{\{\s*([a-z_]+)(?::([a-z0-9_~]+))?\s*\}\}/g;

/** Which world each science module lives in; using one elsewhere loads it first. */
const MODULE_WORLD: Partial<Record<Command["op"], WorldId>> = {
  launch_projectile: "court",
  show_orbits: "space",
  set_fluid: "ocean",
  plot_function: "math",
  plot_point: "math",
  plot_vector: "math",
  build_circuit: "workshop",
  build_lever: "workshop",
  show_wave: "workshop",
  show_globe: "globe",
  mark_place: "globe",
  connect_places: "globe",
};

export function validatePlan(raw: unknown, scene: Pick<SceneSnapshot, "world" | "objects" | "characters">): ValidationResult {
  const env = LoosePlan.safeParse(raw);
  if (!env.success) {
    return { ok: false, error: env.error.issues.slice(0, 6).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  }
  const issues: PlanIssue[] = [];
  const objects = new Set(scene.objects.map((o) => o.id));
  const characters = new Set([GUIDE_ID, ...scene.characters.map((c) => c.id)]);
  let world: WorldId = scene.world;
  let total = 0;
  const marks = new Set<string>();
  const resetTo = (w: WorldId) => {
    objects.clear();
    for (const o of initialObjects(w)) objects.add(o.id);
    characters.clear();
    characters.add(GUIDE_ID);
    marks.clear();
  };
  const placeOrMark = (id: string) => marks.has(id) || (PLACE_IDS as readonly string[]).includes(id);
  const placeholderError = (text: string): string | null => {
    for (const m of text.matchAll(PLACEHOLDER_RE)) {
      const [, name, arg] = m;
      if (!arg) {
        if (!(PLACEHOLDERS as readonly string[]).includes(name)) return `unknown placeholder {{${name}}}`;
        continue;
      }
      if (!(name in ARG_PLACEHOLDERS)) return `unknown placeholder {{${name}:${arg}}}`;
      if (["volume", "surface_area", "float_fraction", "density"].includes(name) && !objects.has(arg)) return `unknown object in {{${name}:${arg}}}`;
      if (["period", "planet_gravity", "distance_au", "radius_km"].includes(name) && !(PLANET_IDS as readonly string[]).includes(arg)) return `unknown planet in {{${name}:${arg}}}`;
      if (name === "distance_km") {
        const ends = arg.split("~");
        if (ends.length !== 2 || !ends.every(placeOrMark)) return `unknown places in {{${name}:${arg}}}`;
      }
    }
    return null;
  };

  const steps = env.data.steps.map((step, si) => {
    const commands: Command[] = [];
    step.commands.forEach((rawCmd, ci) => {
      const op = typeof rawCmd === "object" && rawCmd && "op" in rawCmd ? String((rawCmd as { op: unknown }).op) : "?";
      const drop = (message: string) => issues.push({ step: si, index: ci, op, message });
      if (total >= LIMITS.maxCommands) return drop("command limit reached");
      const parsed = Command.safeParse(rawCmd);
      if (!parsed.success) return drop(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      const c = parsed.data;

      // Science modules need their world; load it first if the plan didn't.
      const home = MODULE_WORLD[c.op];
      if (home && world !== home) {
        commands.push({ op: "load_world", world: home });
        world = home;
        resetTo(world);
        total++;
      }

      switch (c.op) {
        case "load_world":
          // Loading (even the same world) resets to its starting objects + guide.
          world = c.world;
          resetTo(world);
          break;
        case "spawn_shape":
          if ((c.shape === "extrusion" || c.shape === "lathe") && !c.points) return drop(`${c.shape} needs points`);
          if ((c.shape === "tube" || c.shape === "line" || c.shape === "arrow") && !c.path) return drop(`${c.shape} needs a path`);
          if (objects.has(c.id) || characters.has(c.id)) return drop(`id "${c.id}" already exists`);
          if (objects.size >= LIMITS.maxObjects) return drop("object limit reached");
          objects.add(c.id);
          break;
        case "morph_shape":
          if (!objects.has(c.id)) return drop(`unknown object "${c.id}"`);
          break;
        case "plot_function":
          if (!isValidExpression(c.expression)) return drop(`not a valid expression: ${c.expression}`);
          if (c.xMin !== undefined && c.xMax !== undefined && c.xMin >= c.xMax) return drop("xMin must be less than xMax");
          break;
        case "mark_place":
          if (!c.place && (c.lat === undefined || c.lon === undefined)) return drop("mark_place needs a place or lat and lon");
          marks.add(c.id);
          break;
        case "connect_places":
          if (!placeOrMark(c.from) || !placeOrMark(c.to)) return drop("connect_places needs known places or marks");
          break;
        case "show_card": {
          if (c.placement === "object" && (!c.target || (!objects.has(c.target) && !characters.has(c.target)))) return drop("object cards need a known target");
          const err = placeholderError([c.title, c.subtitle ?? "", ...(c.rows ?? []).flatMap((r) => [r.label, r.value]), ...(c.bullets ?? [])].join(" "));
          if (err) return drop(err);
          break;
        }
        case "show_measurement":
          if (["volume", "surface_area", "float_fraction"].includes(c.metric) && (!c.target || !objects.has(c.target))) return drop(`${c.metric} needs a target object`);
          break;
        case "spawn_asset":
        case "spawn_primitive":
        case "build_molecule":
        case "build_atom":
          if (objects.has(c.id) || characters.has(c.id)) return drop(`id "${c.id}" already exists`);
          if (objects.size >= LIMITS.maxObjects) return drop("object limit reached");
          objects.add(c.id);
          break;
        case "spawn_character":
          if (objects.has(c.id) || characters.has(c.id)) return drop(`id "${c.id}" already exists`);
          if (characters.size >= LIMITS.maxCharacters) return drop("character limit reached");
          characters.add(c.id);
          break;
        case "remove_object":
          if (c.id === GUIDE_ID) return drop("the guide cannot be removed");
          if (!objects.delete(c.id) && !characters.delete(c.id)) return drop(`unknown id "${c.id}"`);
          break;
        case "move_object":
        case "rotate_object":
        case "set_object_property":
        case "highlight_object":
        case "apply_force":
        case "set_velocity":
          if (!objects.has(c.id)) return drop(`unknown object "${c.id}"`);
          break;
        case "apply_impulse":
          if (c.id !== "all" && !objects.has(c.id)) return drop(`unknown object "${c.id}"`);
          break;
        case "animate_character":
        case "walk_character":
          if (!characters.has(c.id)) return drop(`unknown character "${c.id}"`);
          break;
        case "speak": {
          if (c.speaker !== "narrator" && !characters.has(c.speaker)) return drop(`unknown speaker "${c.speaker}"`);
          const err = placeholderError(c.text);
          if (err) return drop(err);
          break;
        }
        case "show_annotation":
        case "show_vector":
          if (c.target && !objects.has(c.target) && !characters.has(c.target)) return drop(`unknown target "${c.target}"`);
          break;
        case "focus_camera":
          if (c.target && !objects.has(c.target) && !characters.has(c.target)) return drop(`unknown target "${c.target}"`);
          break;
        case "launch_projectile": {
          const v = toMetersPerSecond(c.speed, c.unit);
          if (v > PROJECTILE_LIMITS.speed.max) return drop(`speed ${v.toFixed(1)} m/s is above the ${PROJECTILE_LIMITS.speed.max} m/s limit`);
          break;
        }
        case "ask_question":
          if (c.answerIndex >= c.choices.length) return drop("answerIndex out of range");
          break;
      }
      commands.push(c);
      total++;
    });
    return { title: step.title, commands };
  });

  const plan = ScenePlan.safeParse({ ...env.data, steps });
  if (!plan.success) return { ok: false, error: plan.error.issues[0]?.message ?? "invalid plan" };
  return { ok: true, plan: plan.data, issues };
}

const SUBJECTS = ["physics", "chemistry", "biology", "math", "earth_space", "general_science", "other"];
const SCOPES = ["in_scope", "too_advanced", "off_topic", "unsafe", "needs_clarification"];
const SUPPORT = ["simulated", "visual", "text"];
const CAPS = ["gravity", "projectile", "molecule", "atom", "orbits", "buoyancy", "graph", "geometry", "circuit", "waves", "lever", "matter", "cell", "globe", "concept", "none"];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const clip = (v: unknown, max: number) => (typeof v === "string" ? (v.length > max ? `${v.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : v) : v);

/** Split long narration at sentence breaks instead of losing it. */
function splitSpeech(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const next = cur ? `${cur} ${sentence}` : sentence;
    if (next.length <= max) cur = next;
    else {
      if (cur) out.push(cur);
      cur = sentence.length > max ? (clip(sentence, max) as string) : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Text limits per command field; over-long text is trimmed rather than rejected. */
const FIELD_LIMITS: Record<string, Record<string, number>> = {
  show_annotation: { text: 140 },
  show_card: { title: 60, subtitle: 90 },
  ask_question: { question: 160, explanation: 240 },
  show_formula: { title: 60, formula: 120 },
  spawn_asset: { label: 40 },
  spawn_shape: { label: 40 },
  spawn_primitive: { label: 40 },
  spawn_character: { name: 20 },
  show_vector: { label: 30 },
};

function normalizeCommands(cmds: unknown[]): unknown[] {
  const out: unknown[] = [];
  for (const c of cmds) {
    if (!isObj(c)) continue;
    const op = String(c.op ?? "");
    if (op === "speak" && typeof c.text === "string") {
      for (const t of splitSpeech(c.text, LIMITS.maxSpeakChars)) out.push({ ...c, text: t });
      continue;
    }
    const lim = FIELD_LIMITS[op];
    const n: Obj = { ...c };
    if (lim) for (const [k, max] of Object.entries(lim)) n[k] = clip(n[k], max);
    if (op === "ask_question" && Array.isArray(n.choices)) n.choices = n.choices.slice(0, 4).map((x) => clip(x, 60));
    if (op === "show_card") {
      if (Array.isArray(n.rows)) n.rows = n.rows.slice(0, 6).map((r) => (isObj(r) ? { label: clip(r.label, 40), value: clip(typeof r.value === "number" ? String(r.value) : r.value, 70) } : r));
      if (Array.isArray(n.bullets)) n.bullets = n.bullets.slice(0, 5).map((b) => clip(b, 160));
    }
    out.push(n);
  }
  return out;
}

/**
 * Make model output fit the plan envelope: fill missing fields with safe
 * defaults, trim over-long text, split long narration. Commands are still
 * validated one by one afterwards.
 */
export function normalizePlan(raw: unknown, lang: "en" | "id"): unknown {
  if (!isObj(raw)) return raw;
  const p: Obj = { ...raw };
  const strs = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).slice(0, n).map((x) => clip(x, max)) : []);
  const steps = Array.isArray(p.steps) ? p.steps.filter(isObj).slice(0, LIMITS.maxSteps) : [];
  p.steps = steps.map((st, i) => ({ title: clip(typeof st.title === "string" && st.title ? st.title : `Step ${i + 1}`, 60), commands: Array.isArray(st.commands) ? normalizeCommands(st.commands) : [] }));
  const firstLine = (p.steps as { commands: Obj[] }[]).flatMap((st) => st.commands).find((c) => c.op === "speak")?.text;
  p.schemaVersion = 1;
  p.scope = SCOPES.includes(p.scope as string) ? p.scope : "in_scope";
  p.language = p.language === "en" || p.language === "id" ? p.language : lang;
  p.title = clip(typeof p.title === "string" && p.title ? p.title : "Let's explore", 60);
  if (typeof p.question === "string" && p.question.trim()) p.question = clip(p.question, 70);
  else delete p.question;
  p.subject = SUBJECTS.includes(p.subject as string) ? p.subject : "general_science";
  p.supportLevel = SUPPORT.includes(p.supportLevel as string) ? p.supportLevel : "visual";
  p.capability = CAPS.includes(p.capability as string) ? p.capability : "concept";
  p.reply = clip(typeof p.reply === "string" && p.reply ? p.reply : (firstLine ?? p.title), 500);
  if (typeof p.details === "string") p.details = clip(p.details, 1500);
  else delete p.details;
  p.assumptions = strs(p.assumptions, 5, 120);
  p.limitations = strs(p.limitations, 4, 160);
  p.followUps = strs(p.followUps, 4, 70);
  return p;
}

/**
 * Replace {{name}} and {{name:arg}} with engine-computed values. `values` is a
 * lookup ("name" or "name:arg" keys) or a resolver. Unknown ones become "?".
 */
export function fillPlaceholders(text: string, values: Partial<Record<string, string>> | ((name: string, arg?: string) => string | undefined)): string {
  return text.replace(PLACEHOLDER_RE, (match: string, name: string, arg: string | undefined, at: number) => {
    const v = (typeof values === "function" ? values(name, arg) : values[arg ? `${name}:${arg}` : name]) ?? "?";
    // Values carry their unit; the model sometimes writes it again ("{{distance_km:a~b}} km"). Keep one.
    const unit = v.match(/ (\S+)$/)?.[1];
    return unit && text.startsWith(` ${unit}`, at + match.length) ? v.slice(0, -unit.length - 1) : v;
  });
}
