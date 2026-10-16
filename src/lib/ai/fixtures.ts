// Offline demo plans for when no Gemini credentials are configured (local
// dev, CI, judging fallback). The UI badges these as "Offline demo" so they
// are never passed off as live AI output.

import type { ScenePlan } from "../ssp/schema";
import { matchCapabilities } from "./capabilities";

const base = { schemaVersion: 1 as const, scope: "in_scope" as const, language: "en" as const };

export const FIXTURES: Record<"gravity" | "projectile" | "molecule", ScenePlan> = {
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
  if (cap === "gravity" || cap === "projectile" || cap === "molecule") return FIXTURES[cap];
  return null;
}
