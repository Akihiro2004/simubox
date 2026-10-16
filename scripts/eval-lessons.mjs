// Plays every example prompt through the real app (live Gemini) and records
// what each lesson planned, said and showed, so lessons can be reviewed.
//
//   node scripts/eval-lessons.mjs [baseUrl] [filter]
//
// Writes test-results/eval/report.json and one screenshot per spoken line.
// Uses Gemini credits: about one plan call per prompt. Voice is muted.

import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
const FILTER = process.argv[3] ? new RegExp(process.argv[3], "i") : null;
const OUT = process.env.EVAL_OUT || "test-results/eval";

/** Each session starts from a fresh app; prompts in it are follow-ups on the same scene. */
const SESSIONS = [
  { name: "gravity", prompts: ["What happens if gravity disappears in my bedroom?", "What if gravity is twice as strong?", "Push the red ball to the right."] },
  { name: "projectile", prompts: ["Throw a basketball at 40 degrees at 20 km/h, how far does it go?", "Change the angle to 60 degrees."] },
  { name: "molecules", prompts: ["Show me a water molecule and explain why it is bent.", "Show CO2 and compare its shape to water."] },
  { name: "photosynthesis", prompts: ["Explain photosynthesis."], expect: { supportLevel: "visual" } },
  { name: "newton", prompts: ["Explain Newton's second law to a 12-year-old.", "Can you explain it in Indonesian?"], expectLast: { language: "id" } },
  { name: "advanced", prompts: ["Explain quantum chromodynamics."], expect: { scope: "too_advanced" } },
  { name: "offtopic", prompts: ["Write my history essay."], expect: { scope: "off_topic" } },
  { name: "moon", prompts: ["What would a ball do on the Moon?"] },
  { name: "carbon", prompts: ["Show me what a carbon atom looks like"] },
  { name: "falling", prompts: ["Do heavy things fall faster?"] },
  { name: "starter-gravity", prompts: ["What if gravity disappeared in my room?"] },
  { name: "starter-throw", prompts: ["Throw a basketball at 40° and 20 km/h"] },
  { name: "starter-water", prompts: ["Why is a water molecule bent?"] },
  { name: "orbits", prompts: ["How do the planets orbit the Sun?"], expect: { capability: "orbits" } },
  { name: "buoyancy", prompts: ["Why does ice float on water?"], expect: { capability: "buoyancy" } },
  { name: "graph", prompts: ["Graph y = x^2 - 3 and explain its shape"], expect: { capability: "graph" } },
  { name: "circuit", prompts: ["How does a series circuit work?", "Break the second bulb", "Make it parallel"] },
  { name: "swap", prompts: ["What if Earth and Neptune switched places?"], expect: { capability: "orbits" } },
  { name: "waves", prompts: ["What is a wave?"], expect: { capability: "waves" } },
  { name: "lever", prompts: ["How does a seesaw balance?"], expect: { capability: "lever" } },
  { name: "globe", prompts: ["How far is London from New York?"], expect: { capability: "globe" } },
  { name: "cell", prompts: ["What is inside an animal cell?"], expect: { capability: "cell" } },
  { name: "periodic", prompts: ["Why are noble gases so unreactive?"] },
  { name: "matter", prompts: ["What happens to water particles when ice melts?"], expect: { capability: "matter" } },
];

const ACTIONS = new Set(["load_world", "spawn_asset", "spawn_primitive", "spawn_shape", "morph_shape", "move_object", "set_gravity", "apply_impulse", "apply_force", "set_velocity", "launch_projectile", "set_parameter", "build_molecule", "build_atom", "show_orbits", "set_fluid", "plot_function", "plot_point", "plot_vector", "build_circuit", "show_wave", "build_lever", "show_particles", "show_cell", "show_globe", "mark_place", "connect_places", "show_periodic_table", "set_module", "set_environment", "remove_object"]);

/** Automatic checks; anything flagged still gets a human read. */
function checks(plan, captions, expect, prompt = "") {
  const flags = [];
  const cmds = plan.steps.flatMap((s) => s.commands);
  const speaks = cmds.filter((c) => c.op === "speak");
  for (const [k, v] of Object.entries(expect ?? {})) if (plan[k] !== v) flags.push(`expected ${k}=${v}, got ${plan[k]}`);
  if (plan.scope === "in_scope" && speaks.length < 3) flags.push(`only ${speaks.length} speak lines`);
  // Narrate around actions: never three actions in a row with no speech.
  let run = 0;
  for (const c of cmds) {
    if (c.op === "speak") run = 0;
    else if (ACTIONS.has(c.op) && ++run === 3) flags.push(`3+ actions without narration (at ${c.op})`);
  }
  // Numbers the engines should supply, written by hand.
  for (const s of speaks) {
    // The student's own numbers ("at 40 degrees") may be repeated back.
    // Setup values the plan passes to commands (build_lever 10 kg) are inputs too.
    const inputs = prompt + JSON.stringify(cmds.filter((c) => c.op !== "speak" && c.op !== "show_card" && c.op !== "show_annotation"));
    const bare = s.text.replace(/\{\{[^}]*\}\}/g, "").replace(/\d[\d.,]*/g, (n) => (inputs.includes(n) ? "" : n));
    if (/\d[\d.,]*\s*(%|percent|m\/s|km\/h|mph|m\b|metres?|meters?|s\b|seconds?|kg|kilo|N\b|newtons?|°|degrees|V\b|volts?|A\b|amps?|ohms?|Ω|km|au\b|K\b|kelvin|celsius)/i.test(bare)) flags.push(`hand-written number: "${s.text}"`);
  }
  for (const t of captions) if (/(^|\s)\?(\s|$|[.,!])/.test(t) || t.includes("{{")) flags.push(`unresolved value on screen: "${t}"`);
  return flags;
}

async function runSession(browser, session) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
  // Record plan stream events with arrival times, and everything said on screen.
  await page.addInitScript(() => {
    window.__events = [];
    window.__said = [];
    const real = window.fetch;
    window.fetch = async (url, init) => {
      const res = await real(url, init);
      if (!String(url).includes("/api/ai/plan") || !res.body) return res;
      const t0 = performance.now();
      let buf = "";
      const dec = new TextDecoder();
      const tee = new TransformStream({
        transform(chunk, c) {
          buf += dec.decode(chunk, { stream: true });
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            try {
              const e = JSON.parse(line);
              window.__events.push({ at: performance.now() - t0, type: e.type, index: e.index, plan: e.type === "result" ? e.plan : undefined, issues: e.issues, model: e.model, error: e.error, code: e.code });
            } catch {}
          }
          c.enqueue(chunk);
        },
      });
      return new Response(res.body.pipeThrough(tee), { status: res.status, headers: res.headers });
    };
    setInterval(() => {
      const texts = [...document.querySelectorAll(".speech-bubble"), ...document.querySelectorAll('[aria-label^="Simu says"]')].map((e) => e.textContent.trim()).filter(Boolean);
      for (const t of texts) if (!window.__said.some((s) => s.text === t)) window.__said.push({ at: performance.now(), text: t, fresh: true });
    }, 120);
  });
  await page.goto(BASE);
  await page.getByRole("textbox", { name: /ask simubox/i }).waitFor();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Mute voice" }).click();

  const results = [];
  for (const [i, prompt] of session.prompts.entries()) {
    const dir = `${OUT}/${session.name}-${i + 1}`;
    mkdirSync(dir, { recursive: true });
    await page.evaluate(() => {
      window.__events = [];
      window.__said = [];
    });
    const t0 = Date.now();
    const box = page.getByRole("textbox", { name: /ask simubox/i });
    await box.fill(prompt);
    await box.press("Enter");
    await page.getByRole("button", { name: "Stop" }).waitFor({ timeout: 10_000 }).catch(() => {});
    let shot = 0;
    // Play until the lesson ends; answer predictions; screenshot each new line.
    while (Date.now() - t0 < 240_000) {
      const done = (await page.getByRole("button", { name: "Stop" }).count()) === 0;
      if (done && Date.now() - t0 > 3000) break;
      const q = page.getByRole("dialog", { name: "Make a prediction" });
      if (await q.isVisible().catch(() => false)) {
        await page.waitForTimeout(800);
        await q.getByRole("button").first().click().catch(() => {});
      }
      const fresh = await page.evaluate(() => {
        const f = window.__said.filter((s) => s.fresh);
        f.forEach((s) => (s.fresh = false));
        return f.length;
      });
      if (fresh) {
        await page.waitForTimeout(900); // let the action that goes with the line play out
        await page.screenshot({ path: `${dir}/${String(++shot).padStart(2, "0")}.png` });
      }
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${dir}/end.png` });
    const { events, said } = await page.evaluate(() => ({ events: window.__events, said: window.__said.map((s) => s.text) }));
    const result = events.find((e) => e.type === "result");
    const err = events.find((e) => e.type === "error");
    const firstStep = events.find((e) => e.type === "plan_step");
    const plan = result?.plan;
    const expect = i === session.prompts.length - 1 ? { ...session.expect, ...session.expectLast } : session.expect;
    const r = {
      session: session.name,
      prompt,
      ms: { firstStep: firstStep ? Math.round(firstStep.at) : null, planDone: result ? Math.round(result.at) : null, lessonDone: Date.now() - t0 },
      error: err ? `${err.code}: ${err.error}` : null,
      model: result?.model,
      dropped: result?.issues?.length ?? null,
      scope: plan?.scope,
      capability: plan?.capability,
      supportLevel: plan?.supportLevel,
      language: plan?.language,
      title: plan?.title,
      reply: plan?.reply,
      steps: plan?.steps.map((s) => ({ title: s.title, commands: s.commands.map((c) => (c.op === "speak" ? `speak(${c.speaker}): ${c.text}` : JSON.stringify(c))) })),
      said,
      followUps: plan?.followUps,
      flags: plan ? checks(plan, said, expect, prompt) : ["no plan"],
      errors: [...errors],
    };
    errors.length = 0;
    results.push(r);
    console.log(`${r.session.padEnd(15)} ${prompt.slice(0, 44).padEnd(44)} first ${((r.ms.firstStep ?? 0) / 1000).toFixed(1)}s plan ${((r.ms.planDone ?? 0) / 1000).toFixed(1)}s lesson ${(r.ms.lessonDone / 1000).toFixed(0)}s  ${r.error ?? `${r.model} ${r.capability}/${r.scope} dropped ${r.dropped}`}  flags ${r.flags.length}${r.errors.length ? ` errors ${r.errors.length}` : ""}`);
  }
  await ctx.close();
  return results;
}

mkdirSync(OUT, { recursive: true });
const launch = () => chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let browser = await launch();
const all = [];
for (const s of SESSIONS) {
  if (FILTER && !FILTER.test(s.name)) continue;
  try {
    all.push(...(await runSession(browser, s)));
  } catch (e) {
    // A crashed page or browser must not end the whole run.
    const why = String(e).split(/\r?\n/)[0];
    console.log(`${s.name.padEnd(15)} CRASHED: ${why}`);
    all.push({ session: s.name, prompt: s.prompts.join(" | "), error: `harness: ${why}`, flags: ["crashed"], errors: [] });
    if (!browser.isConnected()) browser = await launch();
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(all, null, 1));
}
await browser.close();
const flagged = all.filter((r) => r.flags.length || r.errors.length || r.error);
console.log(`\n${all.length} lessons, ${flagged.length} with flags or errors. Report: ${OUT}/report.json`);
