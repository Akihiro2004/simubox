// Offline demo plans for when no Gemini credentials are configured (local
// dev, CI, judging fallback). The UI badges these as "Offline demo" so they
// are never passed off as live AI output.

import type { ScenePlan } from "../ssp/schema";
import { matchCapabilities } from "./capabilities";

const base = { schemaVersion: 1 as const, scope: "in_scope" as const, language: "en" as const };

export const FIXTURES: Record<"gravity" | "projectile" | "molecule" | "mechanics" | "maths" | "waves" | "anatomy" | "digestion" | "breathing", ScenePlan> = {
  digestion: {
    ...base, title: "Where your lunch goes", subject: "biology", supportLevel: "simulated", capability: "anatomy",
    reply: "This built-in Anatomy Lab demo follows a meal through a real body. The whole trip takes {{digestion_total}} on average.",
    steps: [
      { title: "Swallow", commands: [{ op: "show_anatomy", system: "digestive", instrument: "digestion", hoursAfterMeal: 0.005, playing: false, highlight: "esophagus" }, { op: "speak", speaker: "simu", text: "This is a built-in demo. After you chew and swallow, muscles in the oesophagus squeeze the food down to your stomach in a few seconds." }] },
      { title: "Stomach", commands: [{ op: "set_module", module: "anatomy", set: { hoursAfterMeal: 1, highlight: "stomach" } }, { op: "speak", speaker: "simu", text: "The food is now in the {{food_location}}. Acid and enzymes churn it into a thick soup for a few hours." }] },
      { title: "Small intestine", commands: [{ op: "set_module", module: "anatomy", set: { hoursAfterMeal: 5, highlight: "small_intestine" } }, { op: "speak", speaker: "simu", text: "In the {{food_location}}, most nutrients pass into your blood. The liver, about {{organ_mass:liver}}, sends bile to help digest fat." }] },
      { title: "Large intestine", commands: [{ op: "ask_question", question: "What does the large intestine mostly take back into the body?", choices: ["Water", "Protein", "Sugar"], answerIndex: 0, explanation: "Most nutrients are absorbed earlier; the large intestine takes back water and salts." }, { op: "set_module", module: "anatomy", set: { hoursAfterMeal: 20, highlight: "large_intestine", playing: true } }, { op: "speak", speaker: "simu", text: "Now it is in the {{food_location}}, where water goes back into the body and gut bacteria break down fibre." }] },
    ], assumptions: ["Typical healthy-adult transit times for a mixed meal."], limitations: ["This is a built-in example, not a new AI-generated answer.", "Real meals vary a lot: fatty food leaves the stomach more slowly."],
    followUps: ["How does my body use air to breathe?", "How does my heart pump blood?", "Why do we pee more when we drink lots of water?"],
  },
  breathing: {
    ...base, title: "How you breathe", subject: "biology", supportLevel: "simulated", capability: "anatomy",
    reply: "This built-in Anatomy Lab demo runs a lung model. Each quiet breath moves {{tidal_volume}} of air, and {{blood_oxygen}}.",
    steps: [
      { title: "Air goes in", commands: [{ op: "show_anatomy", system: "respiratory", instrument: "breathing", highlight: "diaphragm", breathsPerMin: 12, effortCmH2O: 5.5, metabolicRate: 1 }, { op: "speak", speaker: "simu", text: "This is a built-in demo. When the diaphragm under your lungs tightens, it moves down {{diaphragm_travel}} and pulls in {{tidal_volume}} of air." }] },
      { title: "Into the blood", commands: [{ op: "set_module", module: "anatomy", set: { highlight: "lung_right" } }, { op: "speak", speaker: "simu", text: "The air goes down the windpipe into millions of tiny air sacs. Oxygen crosses into the blood: {{blood_oxygen}}. Carbon dioxide comes out the other way." }] },
      { title: "Running", commands: [{ op: "ask_question", question: "When you run, what happens to your breathing?", choices: ["Faster and deeper", "Slower", "It stops"], answerIndex: 0, explanation: "Your muscles use more oxygen and make more carbon dioxide." }, { op: "set_module", module: "anatomy", set: { breathsPerMin: 30, effortCmH2O: 16, metabolicRate: 6 } }, { op: "speak", speaker: "simu", text: "Running, your muscles use {{oxygen_used}} of oxygen. You breathe {{minute_ventilation}}, and your blood still stays well supplied: {{blood_oxygen}}." }] },
    ], assumptions: ["Healthy adult lungs; one-compartment lung mechanics."], limitations: ["This is a built-in example, not a new AI-generated answer."],
    followUps: ["What happens in an asthma attack?", "How does my heart carry the oxygen?", "What happens after we eat?"],
  },
  anatomy: {
    ...base, title: "How your heart pumps", subject: "biology", supportLevel: "simulated", capability: "anatomy",
    reply: "This built-in Anatomy Lab demo runs a heart model. At rest it pumps {{stroke_volume}} with each beat, about {{cardiac_output}}, at a blood pressure of {{blood_pressure}}.",
    steps: [
      { title: "Peel back the skin", commands: [{ op: "show_anatomy", system: "all", depth: 2, highlight: "heart", instrument: "none" }, { op: "speak", speaker: "simu", text: "This is a built-in demo with a real, life-size human body. Under the skin and ribs, the heart sits in the middle of your chest, a little to the left." }] },
      { title: "Start the heartbeat", commands: [{ op: "show_anatomy", instrument: "heart", highlight: "heart", heartRateBpm: 72 }, { op: "speak", speaker: "simu", text: "Each squeeze pushes {{stroke_volume}} of blood into the aorta. Watch the red pulse race down the arteries at {{pulse_wave_speed}}. The monitor shows a blood pressure of {{blood_pressure}}." }] },
      { title: "Exercise", commands: [{ op: "ask_question", question: "When you run, what happens to the blood your heart pumps each minute?", choices: ["It goes up a lot", "It stays the same", "It goes down"], answerIndex: 0, explanation: "Your heart beats faster and harder, and your muscles' blood vessels widen." }, { op: "set_module", module: "anatomy", set: { heartRateBpm: 150, contractility: 1.8, resistance: 0.45, fillingMmHg: 14 } }, { op: "speak", speaker: "simu", text: "Now the heart beats {{heart_rate}} and pumps {{cardiac_output}}, several times more than at rest." }] },
    ], assumptions: ["A healthy adult heart; only the left side is modelled."], limitations: ["This is a built-in example, not a new AI-generated answer."],
    followUps: ["How do lungs fill with air?", "Why does the knee jerk when the doctor taps it?", "Where does food go after I swallow?"],
  },
  mechanics: {
    ...base, title: "Force, mass and acceleration", subject: "physics", supportLevel: "simulated", capability: "mechanics",
    reply: "This built-in Mechanics Lab demo compares the same push on two different masses. Net force divided by mass gives acceleration: {{mechanics_acceleration}} after the change.",
    steps: [
      { title: "Start the dynamics track", commands: [{ op: "show_mechanics", mode: "force", forceN: 4, massKg: 2, durationS: 3 }, { op: "speak", speaker: "simu", text: "This is a built-in force experiment. Watch the orange cart speed up under a steady push." }] },
      { title: "Predict and compare", commands: [{ op: "ask_question", question: "With the same force, what happens when the mass doubles?", choices: ["Acceleration halves", "Acceleration doubles", "Acceleration stays the same"], answerIndex: 0, explanation: "Acceleration is net force divided by mass." }, { op: "set_module", module: "mechanics", set: { massKg: 4 } }, { op: "speak", speaker: "simu", text: "The heavier cart accelerates less. At the chosen time its acceleration is {{mechanics_acceleration}} and its momentum is {{mechanics_momentum}}." }] },
    ], assumptions: ["Ideal 1D track; no friction or air resistance."], limitations: ["This is a built-in example, not a new AI-generated answer."],
    followUps: ["Compare elastic and sticky collisions", "What if the same impulse lasts longer?", "Show a cart slowing down with friction"],
  },
  maths: {
    ...base, title: "Adding fraction strips", subject: "math", supportLevel: "simulated", capability: "maths",
    reply: "This built-in Math Studio example adds one half and one third. Cutting both into equal-size pieces gives {{math_formula}} = {{math_answer}}.",
    steps: [
      { title: "Compare the pieces", commands: [{ op: "show_math", mode: "fractions", numerator: 1, denominator: 2, numerator2: 1, denominator2: 3 }, { op: "speak", speaker: "simu", text: "This is a built-in fraction example. The green tiles and gold tiles have different sizes, so we first give them a common denominator." }] },
      { title: "Equal-size sixths", commands: [{ op: "ask_question", question: "How many sixths equal one half?", choices: ["One", "Two", "Three"], answerIndex: 2, explanation: "Three equal sixths cover exactly one half." }, { op: "show_math", mode: "fractions", numerator: 3, denominator: 6, numerator2: 2, denominator2: 6 }, { op: "speak", speaker: "simu", text: "Now every tile has the same size. The result is {{math_answer}}. Try another investigation in the controls." }] },
    ], assumptions: ["Each tile is one denominator-sized part of a whole."], limitations: ["This is a fixed fraction demo; the controls offer other math models."],
    followUps: ["Solve a linear equation", "Convert metres to centimetres", "Show why the sine of thirty degrees is one half"],
  },
  waves: {
    ...base, title: "Wind and water waves", subject: "physics", supportLevel: "simulated", capability: "waves",
    reply: "This built-in ripple-tank example illustrates wind transferring energy to water. Stronger forcing makes larger ripples here; real ocean wave growth also depends on wind duration and fetch.",
    steps: [
      { title: "Wind drives the tank", commands: [{ op: "load_world", world: "workshop" }, { op: "show_ripple_tank", windSpeedMps: 4, source: "plane" }, { op: "speak", speaker: "simu", text: "Wind transfers energy to water. Our ripple tank models how the waves travel; the wind strength is an illustrative driver, not a forecast of ocean wave heights." }] },
      { title: "Compare stronger forcing", commands: [{ op: "wait", ms: 1500 }, { op: "set_module", module: "ripple", set: { windSpeedMps: 12 } }, { op: "speak", speaker: "simu", text: "The wind driver is now {{wind_speed}}. Waves carry energy while water moves mainly locally. In the ocean, fetch is the distance over which wind blows in one direction." }] },
    ], assumptions: ["Small-amplitude tank wave model; visual heights are exaggerated."], limitations: ["Wind-to-amplitude mapping is qualitative, not an ocean forecast.", "No coupled air-water turbulence or wind-duration/fetch growth model."],
    followUps: ["What happens in shallower water?", "Show waves spreading through a gap", "Compare two sources making interference"],
  },
  gravity: {
    ...base,
    title: "Gravity switched off",
    subject: "physics",
    supportLevel: "simulated",
    capability: "gravity",
    reply: "With no gravity, nothing pulls things down. Objects at rest just stay put until something pushes them, then they drift and bounce until they hit something.",
    details:
      "Gravity is a pull between masses. Earth pulls everything toward its center with about 9.81 m/s² of acceleration. Remove that pull and an object at rest feels no net force, so by Newton's first law (inertia) it stays at rest. Once pushed, it keeps moving in a straight line at the same speed until a wall or another object changes its motion.",
    steps: [
      {
        title: "Set the scene",
        commands: [
          { op: "load_world", world: "bedroom" },
          { op: "animate_character", id: "simu", animation: "wave" },
          { op: "speak", speaker: "simu", text: "Here is my room with normal Earth gravity. Everything sits on the floor or the desk.", emotion: "happy" },
          { op: "ask_question", question: "If gravity suddenly vanished, what would the ball on the floor do?", choices: ["Fly up to the ceiling", "Stay where it is", "Sink into the floor"], answerIndex: 1, explanation: "Nothing pushes it, so it stays at rest. That's inertia!" },
        ],
      },
      {
        title: "Gravity off",
        commands: [
          { op: "set_gravity", gravity: [0, 0, 0] },
          { op: "show_annotation", id: "g_label", text: "Gravity: 0 m/s²", target: "red_ball", tone: "fact" },
          { op: "speak", speaker: "simu", text: "Gravity is now zero. See? Nothing moves yet, because nothing is pushing.", emotion: "curious" },
          { op: "animate_character", id: "simu", animation: "point" },
          { op: "speak", speaker: "simu", text: "Now I'll give everything a tiny nudge.", emotion: "excited" },
          { op: "apply_impulse", id: "all", impulse: [0, 1.1, 0] },
          { op: "wait", ms: 1800 },
          { op: "speak", speaker: "simu", text: "Whee! Each object keeps drifting in a straight line until it bumps into something.", emotion: "excited" },
        ],
      },
      {
        title: "Your turn",
        commands: [
          { op: "speak", speaker: "simu", text: "Drag and throw things, or try the gravity buttons below. Try the Moon or Jupiter!", emotion: "happy" },
        ],
      },
    ],
    assumptions: ["Air slows objects only a little (small drag).", "Walls and ceiling stop objects from leaving the room."],
    limitations: ["Real astronauts' rooms also have air currents that move things around."],
    followUps: ["What if gravity is twice as strong?", "Push the red ball to the right", "Why do astronauts float?"],
  },
  projectile: {
    ...base,
    title: "Throwing a basketball",
    subject: "physics",
    supportLevel: "simulated",
    capability: "projectile",
    reply: "A ball thrown at 40° and 20 km/h follows a curved path called a parabola. Gravity slows its rise, stops it at the top, then pulls it back down.",
    details:
      "Split the velocity into a horizontal part vx = v·cos θ and a vertical part vy = v·sin θ. Without air drag, vx never changes, while gravity reduces vy by g every second. Flight time T = 2·v·sin θ / g, range R = v²·sin(2θ) / g, and max height H = v²·sin²θ / (2g) (launch and landing at the same height).",
    steps: [
      {
        title: "Launch",
        commands: [
          { op: "load_world", world: "court" },
          { op: "speak", speaker: "simu", text: "Let's throw a basketball at 20 kilometers per hour, angled 40 degrees up.", emotion: "excited" },
          { op: "launch_projectile", speed: 20, unit: "km/h", angleDeg: 40, gravity: 9.81, ball: "basketball" },
          { op: "wait_for", event: "projectile_landed", timeoutMs: 6000 },
          { op: "show_measurement", metric: "range" },
          { op: "show_measurement", metric: "flight_time" },
          { op: "show_measurement", metric: "max_height" },
          { op: "speak", speaker: "simu", text: "It landed {{range}} away after {{flight_time}}, reaching {{max_height}} at the top.", emotion: "happy" },
        ],
      },
      {
        title: "The math",
        commands: [
          {
            op: "show_formula",
            title: "Range on flat ground",
            formula: "R = v² · sin(2θ) / g",
            variables: [
              { symbol: "v", meaning: "launch speed", unit: "m/s" },
              { symbol: "θ", meaning: "launch angle" },
              { symbol: "g", meaning: "gravity", unit: "m/s²" },
            ],
          },
          { op: "speak", speaker: "simu", text: "Sideways speed stays the same the whole time, while gravity keeps pulling the up-and-down speed.", emotion: "calm" },
          { op: "speak", speaker: "simu", text: "Move the sliders to change speed and angle. Which angle throws the farthest?", emotion: "curious" },
        ],
      },
    ],
    assumptions: ["No air resistance.", "Launch and landing at the same height.", "g = 9.81 m/s²."],
    limitations: ["A real basketball slows down a little because of air drag, so it lands slightly shorter."],
    followUps: ["Change the angle to 60 degrees", "What if we threw it on the Moon?", "Which angle goes the farthest?"],
  },
  molecule: {
    ...base,
    title: "Why water is bent",
    subject: "chemistry",
    supportLevel: "simulated",
    capability: "molecule",
    reply: "Water (H₂O) is bent at about 104.5° because oxygen has two lone pairs of electrons that push the two hydrogen atoms closer together.",
    details:
      "Oxygen has 4 electron groups around it: 2 bonds to hydrogen and 2 lone pairs. Electron groups repel each other and spread out (VSEPR theory). Lone pairs repel a bit more strongly than bonds, squeezing the H–O–H angle from the ideal 109.5° down to about 104.5°. The bent shape makes water polar.",
    steps: [
      {
        title: "Build water",
        commands: [
          { op: "load_world", world: "lab" },
          { op: "build_molecule", id: "water", molecule: "H2O" },
          { op: "speak", speaker: "narrator", text: "This is a water molecule: one oxygen atom in red and two hydrogen atoms in white." },
          { op: "show_annotation", id: "angle_note", text: "Bond angle about 104.5°", target: "water", tone: "fact" },
          { op: "speak", speaker: "narrator", text: "Notice it's bent, not a straight line. The angle between the hydrogens is about 104.5 degrees." },
          { op: "speak", speaker: "narrator", text: "The soft purple clouds are lone pairs: electrons that push the hydrogens down and together." },
          { op: "speak", speaker: "narrator", text: "Drag to spin the molecule, and tap an atom to learn about it." },
        ],
      },
    ],
    assumptions: ["Ball-and-stick model: atom sizes and colors are a simplified convention.", "Lone pairs are drawn schematically."],
    limitations: ["Real molecules vibrate constantly; this shows the average shape."],
    followUps: ["Show CO2 and compare its shape to water", "Why is water polar?", "Show me methane"],
  },
};

export function pickFixture(prompt: string): ScenePlan | null {
  const cap = matchCapabilities(prompt)[0];
  if (cap === "anatomy") return /eat|food|meal|digest|stomach|swallow|makan|cerna/i.test(prompt) ? FIXTURES.digestion : /breath|lung|air|oxygen|napas|paru/i.test(prompt) ? FIXTURES.breathing : FIXTURES.anatomy;
  if (cap === "gravity" || cap === "projectile" || cap === "molecule" || cap === "mechanics" || cap === "maths" || cap === "waves") return FIXTURES[cap];
  return null;
}
