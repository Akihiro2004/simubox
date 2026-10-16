# Implementation status

Last updated 2026-10-16. Evidence column lists how each item was checked. Nothing here claims a live Gemini call or a deployment that hasn't happened.

## Verified

| Area | Evidence |
| --- | --- |
| Projectile engine and unit conversion | `tests/unit/engine.test.ts`: 120 grid cases against textbook formulas, 20 km/h at 40° gives 3.0984 m / 0.7280 s / 0.6500 m, edge cases (90°, 0°, zero gravity, launch height, invalid input) |
| Molecule geometry | Bond lengths and every listed angle re-measured from generated coordinates (within 0.1°); all six methane angles are 109.47° |
| Scene protocol validation | 24 accept/reject cases (unknown ops, NaN, Infinity, out of bounds, bad ids, colours, units), id tracking across spawn, remove and load, placeholder whitelist, object and command limits |
| Guardrail pre-filter | Unsafe prompts (English and Indonesian) return a safe plan without calling the model; harmless science about explosions is not blocked |
| Gemini request schema | Generated JSON Schema contains only keywords Gemini structured output accepts |
| Dollhouse cutaway | `tests/unit/cutaway.test.ts`: the right walls lower from all four corners, far walls never hide, edge-on hysteresis; checked visually by orbiting in the browser |
| Gravity, projectile and molecule lessons | Played end to end in the browser (offline demos): zero-g float after a nudge, parabola with landing and peak labels, water molecule with 104.5° arc and lone pairs |
| Typecheck, lint, production build | `tsc --noEmit`, `eslint`, `next build` all clean; 234 unit tests, 6 Playwright E2E (two clean runs in a row) |
| Live Gemini lessons | Real `gemini-3.8-flash` through the dev server: 0 dropped commands across 20+ prompts (gravity, orbits, seasons, buoyancy, graphs, circuits, levers, globe distances, cells, guardrails) |
| Dynamic thinking | Scene tweaks and short follow-ups use low thinking and a short plan (4-7 s, e.g. "break the second bulb", "make it parallel"); new questions keep the full lesson (15-25 s). `lessonMode` unit tests |
| set_module | Any field of any simulation module is changeable (broken bulbs, switch, temperature, orbit focus...), validated per module; broken-bulb circuit physics unit-tested and checked in the browser |
| set_environment | Presets (moon, mars, night, dusk, desert, snow, underwater) restyle sky, light, ground, lane paint, scenery, stars, Earth in the sky and craters; Moon/Mars gravity without a restyle gets one automatically. Checked in the browser on the court |
| Gemini TTS | `gemini-3.8-flash-lite-tts`, one voice per role; lines are sent without style instructions (verified by transcribing the audio back); captions get reading time when no voice is available |
| Formulas | Plain maths typeset with fractions, powers, roots, subscripts and Greek letters (`tests/unit/formula.test.ts`) |
| Controls for every world | Space, ocean, math, globe, workshop, lab controls exercised in the browser |

## Built, not yet verified live (needs credentials)

| Area | What's needed |
| --- | --- |
| Lesson upload (`/api/ai/lesson`) | Run once with a real PDF |
| Google sign-in and Firestore saving | A Firebase web app on the project, Google provider enabled, rules deployed |
| Cloud Run deployment | Run `scripts/deploy.ps1` with a project you approve (billable) |

## Acceptance prompts to run once Gemini is connected

1. What happens if gravity disappears in my bedroom?
2. What if gravity is twice as strong?
3. Push the red ball to the right.
4. Throw a basketball at 40 degrees at 20 km/h, how far does it go?
5. Change the angle to 60 degrees.
6. Show me a water molecule and explain why it is bent.
7. Show CO2 and compare its shape to water.
8. Explain photosynthesis. (expect "Illustration", not "Live simulation")
9. Explain Newton's second law to a 12-year-old.
10. Can you explain it in Indonesian?
11. Explain quantum chromodynamics. (expect `too_advanced`)
12. Write my history essay. (expect `off_topic`)

## Known limitations

- Rate limiting is in memory per Cloud Run instance.
- Room physics uses small linear damping as a stand-in for air resistance.
- No GLB assets yet; everything is procedural (by design, for one consistent style).
- The 3D map is being redesigned separately; the cutaway and world layout may change.
