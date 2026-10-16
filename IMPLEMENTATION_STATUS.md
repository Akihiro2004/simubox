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
| Typecheck, lint, production build | `tsc --noEmit`, `eslint`, `next build` all clean |

## Built, not yet verified live (needs credentials)

| Area | What's needed |
| --- | --- |
| Live Gemini planning (`/api/ai/plan`) | A `GEMINI_API_KEY` locally, or Vertex AI on Cloud Run. Then run the acceptance prompts below and tune the system prompt on real output. |
| Lesson upload (`/api/ai/lesson`) | Same as above |
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
