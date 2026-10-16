// Worked example lessons shown to Gemini (few-shot). Each one demonstrates
// the lesson arc: hook -> predict -> show while narrating -> explain with
// cards/labels -> invite the student to play. Unit tests keep them valid.

import type { ScenePlan } from "../ssp/schema";

const base = { schemaVersion: 1 as const, scope: "in_scope" as const, language: "en" as const };

export const EXAMPLES: { prompt: string; world: string; plan: ScenePlan }[] = [
  {
    prompt: "What happens if gravity disappears in my bedroom?",
    world: "bedroom",
    plan: {
      ...base,
      title: "A room without gravity",
      question: "What if my bedroom had no gravity?",
      subject: "physics",
      supportLevel: "simulated",
      capability: "gravity",
      reply: "Without gravity nothing pulls things down. Objects at rest stay put until something pushes them; then they drift in straight lines until they bump into something.",
      details: "Newton's first law: an object keeps doing what it is doing unless a force acts on it. Gravity is the force that normally pulls everything down at 9.81 m/s².",
      steps: [
        {
          title: "Hook",
          commands: [
            { op: "focus_camera", target: "red_ball", zoom: "medium" },
            { op: "animate_character", id: "simu", animation: "wave" },
            { op: "speak", speaker: "simu", text: "Everything in my room is pulled down by gravity. What if I switch it off?", emotion: "curious" },
            { op: "ask_question", question: "Gravity is gone. What does the red ball on the floor do?", choices: ["Floats up by itself", "Stays exactly where it is", "Rolls away"], answerIndex: 1, explanation: "Nothing is pushing it, so it stays put. That's inertia." },
          ],
        },
        {
          title: "Show",
          commands: [
            { op: "set_gravity", gravity: [0, 0, 0] },
            { op: "show_annotation", id: "g_zero", text: "Gravity: 0 m/s²", target: "red_ball", tone: "fact" },
            { op: "wait", ms: 900 },
            { op: "speak", speaker: "simu", text: "Gravity is off, but look: nothing moves. No push, no motion.", emotion: "surprised" },
            { op: "animate_character", id: "simu", animation: "point" },
            { op: "speak", speaker: "simu", text: "Now a tiny nudge for everything.", emotion: "excited" },
            { op: "apply_impulse", id: "all", impulse: [0, 1.2, 0] },
            { op: "wait", ms: 1600 },
            { op: "highlight_object", id: "red_ball", on: true },
            { op: "speak", speaker: "simu", text: "Whee! Each thing keeps drifting in a straight line until it hits a wall.", emotion: "excited" },
          ],
        },
        {
          title: "Explain",
          commands: [
            {
              op: "show_card",
              id: "law1",
              placement: "center",
              title: "Newton's first law",
              subtitle: "Why things float in space",
              rows: [
                { label: "Gravity now", value: "{{gravity}}" },
                { label: "Force on a resting ball", value: "none" },
              ],
              bullets: ["Objects at rest stay at rest.", "Moving objects keep moving in a straight line until a force acts."],
              tone: "fact",
            },
            { op: "speak", speaker: "simu", text: "Astronauts see this every day on the space station. Try throwing something, or ask me what double gravity would do!", emotion: "happy" },
          ],
        },
      ],
      assumptions: ["A little air slows things down slightly.", "Walls and ceiling keep everything inside the room."],
      limitations: [],
      followUps: ["What if gravity is twice as strong?", "Push the red ball to the right", "Why do astronauts float?"],
    },
  },
  {
    prompt: "How do plants make food?",
    world: "park",
    plan: {
      ...base,
      title: "How plants make food",
      question: "How do plants make their own food?",
      subject: "biology",
      supportLevel: "visual",
      capability: "concept",
      reply: "Plants make their own food by photosynthesis: leaves use sunlight to turn carbon dioxide and water into sugar, and let out oxygen.",
      details: "6 CO₂ + 6 H₂O + light energy → C₆H₁₂O₆ (glucose) + 6 O₂. It happens in chloroplasts, which contain green chlorophyll.",
      steps: [
        {
          title: "Hook",
          commands: [
            { op: "load_world", world: "park" },
            { op: "spawn_character", id: "mia", character: "kid", position: [1.4, 0, 2.6], name: "Mia" },
            { op: "focus_camera", target: "tree_2", zoom: "wide" },
            { op: "speak", speaker: "mia", text: "Simu, how does this tree eat? It doesn't have a mouth!", emotion: "curious" },
            { op: "animate_character", id: "simu", animation: "wave" },
            { op: "speak", speaker: "simu", text: "Trees cook their own food. Let me show you the ingredients.", emotion: "happy" },
          ],
        },
        {
          title: "Ingredients",
          commands: [
            { op: "show_vector", id: "sunlight", origin: [1.6, 5.8, -0.8], vector: [1.6, -2.6, -1.4], color: "#f0a800", label: "Sunlight" },
            { op: "show_vector", id: "co2_in", origin: [6.2, 2.6, -2.5], vector: [-2.1, 0, 0], color: "#8a9099", label: "Carbon dioxide" },
            { op: "show_vector", id: "water_up", origin: [3.5, 0.05, -2.5], vector: [0, 1.5, 0], color: "#2f80ed", label: "Water from roots" },
            { op: "speak", speaker: "simu", text: "Leaves catch sunlight, breathe in carbon dioxide and pull water up from the roots.", emotion: "calm" },
            { op: "ask_question", question: "What do you think the tree makes from these?", choices: ["Sugar and oxygen", "Rocks", "Nothing"], answerIndex: 0, explanation: "It makes sugar for food and gives out oxygen." },
          ],
        },
        {
          title: "What it makes",
          commands: [
            { op: "spawn_shape", id: "sugar", shape: "box", size: [0.25, 0.25, 0.25], position: [3.5, 1.2, -1.6], color: "#f6d57a", glow: true, label: "Sugar" },
            { op: "morph_shape", id: "sugar", size: [0.5, 0.5, 0.5], durationMs: 1500 },
            { op: "show_vector", id: "o2_out", origin: [3.5, 2.6, -2.5], vector: [1.6, 1.1, 1.6], color: "#30a46c", label: "Oxygen out" },
            { op: "speak", speaker: "simu", text: "Inside the leaves, sunlight's energy turns them into sugar for the tree, and oxygen floats out for us to breathe!", emotion: "excited" },
            {
              op: "show_card",
              id: "photosynthesis",
              placement: "center",
              title: "Photosynthesis",
              subtitle: "What goes in and what comes out",
              rows: [
                { label: "In", value: "carbon dioxide + water + light" },
                { label: "Out", value: "sugar + oxygen" },
              ],
              bullets: ["It happens in chloroplasts, which are green because of chlorophyll."],
              tone: "fact",
            },
            { op: "speak", speaker: "mia", text: "So trees make the air I breathe!", emotion: "excited" },
            { op: "animate_character", id: "simu", animation: "celebrate" },
          ],
        },
      ],
      assumptions: ["This is an illustration of the process, not a simulation."],
      limitations: ["Real photosynthesis has many chemical steps inside the chloroplast."],
      followUps: ["What happens to plants at night?", "Show me a plant cell", "Why are leaves green?"],
    },
  },
  {
    prompt: "If I double the sides of a cube, how much bigger is the volume?",
    world: "math",
    plan: {
      ...base,
      title: "Doubling a cube",
      question: "How much bigger is a cube with doubled sides?",
      subject: "math",
      supportLevel: "visual",
      capability: "geometry",
      reply: "Doubling every side makes the volume 8 times bigger, because 2 × 2 × 2 = 8.",
      steps: [
        {
          title: "Two cubes",
          commands: [
            { op: "load_world", world: "math" },
            { op: "spawn_shape", id: "cube_a", shape: "box", size: [1, 1, 1], position: [-1.5, 0.5, 2.4], color: "#6b8fe0", label: "Cube A" },
            { op: "spawn_shape", id: "cube_b", shape: "box", size: [1, 1, 1], position: [1.6, 0.5, 2.4], color: "#f0a800", label: "Cube B" },
            { op: "show_card", id: "card_a", placement: "object", target: "cube_a", title: "Cube A", rows: [{ label: "Side", value: "1 m" }, { label: "Volume", value: "{{volume:cube_a}}" }] },
            { op: "speak", speaker: "simu", text: "Here are two identical cubes, each 1 metre on a side.", emotion: "calm" },
            { op: "ask_question", question: "If cube B's sides all double, its volume becomes…", choices: ["2 times bigger", "4 times bigger", "8 times bigger"], answerIndex: 2, explanation: "Length, width and height all double: 2 × 2 × 2 = 8." },
          ],
        },
        {
          title: "Grow it",
          commands: [
            { op: "speak", speaker: "simu", text: "Let's double every side of cube B and watch.", emotion: "excited" },
            { op: "morph_shape", id: "cube_b", size: [2, 2, 2], position: [1.6, 1, 2.4], durationMs: 2000 },
            { op: "show_card", id: "card_b", placement: "object", target: "cube_b", title: "Cube B", rows: [{ label: "Side", value: "2 m" }, { label: "Volume", value: "{{volume:cube_b}}" }], tone: "fact" },
            { op: "speak", speaker: "simu", text: "Each side doubled, but the volume went from 1 to 8 cubic metres!", emotion: "excited" },
            { op: "show_formula", title: "Volume of a cube", formula: "V = side × side × side", variables: [{ symbol: "V", meaning: "volume", unit: "m³" }] },
            { op: "speak", speaker: "simu", text: "Try asking me what happens if you triple the sides.", emotion: "happy" },
          ],
        },
      ],
      assumptions: [],
      limitations: [],
      followUps: ["What if I triple the sides?", "What about the surface area?", "Show me a sphere's volume"],
    },
  },
];
