# Mechanics Lab, Math Studio and teaching decisions

The two new worlds are `mechanics` and `math_studio`. The existing `math` graph world remains supported, including old saves. Both new worlds use original procedural scenery, the existing camera/quality/reduced-motion system, and ordinary scene/module serialization. Their controlled teaching instruments are module state, not free-moving Rapier object IDs.

## Mechanics

`show_mechanics` opens the dynamics track. `set_module mechanics` adjusts the same instrument. The controls offer thirteen ready-made setups and six underlying models:

| Model | Calculation and assumptions |
| --- | --- |
| Force | Signed net applied force, Newton II, displacement/velocity, momentum, impulse and work. Dry friction opposes motion, stops exactly and cannot drive a reversal. Static and kinetic coefficients are equal in this teaching model. |
| Collision | Two initially separated carts on an isolated 1D track. Momentum conservation plus restitution determines final velocities; restitution from zero (common final velocity) to one (elastic). The impact is instantaneous; the model reports impulses rather than pretending to resolve contact forces. |
| Impulse | Constant force during a specified contact interval, followed by free motion. Integrating the force gives the change in momentum. A time before contact ends reports only the impulse delivered so far. |
| Ramp | Sliding, not rolling-body dynamics. Gravity resolves into mg sin θ along the slope and mg cos θ normal to it. Friction uses the normal force. |
| Spring | Ideal horizontal Hooke spring, arbitrary supported initial extension and velocity, no damping. Kinetic plus elastic potential energy is conserved. |
| Pendulum | Small-angle harmonic approximation, released from rest, amplitude restricted to ±15 degrees. Tangential speed/acceleration and a consistent small-angle energy are reported. Zero gravity produces no restoring oscillation and no finite period. |

All calculations use SI units. Positive means rightward/down the ramp; pendulum speed and acceleration are signed along the arc. The track fits the calculated trajectory with a labelled linear display scale; no invisible walls, teleportation loop or position clamping changes the calculation. Input changes restart a demonstration. Pause holds playback; reduced motion and “Hold at final time” show the selected endpoint. The on-track readout follows playback, while controls and `mechanics_*` placeholders describe the selected `durationS` endpoint.

References: [Newton II and momentum/impulse](https://openstax.org/books/university-physics-volume-1/pages/9-2-impulse-and-collisions), [spring motion](https://openstax.org/books/university-physics-volume-1/pages/15-1-simple-harmonic-motion), [small-angle pendulums](https://openstax.org/books/university-physics-volume-1/pages/15-4-pendulums).

## Math Studio

`show_math` selects a worked investigation. `set_module maths` edits its inputs. The engine, result board, controls and `math_answer`/`math_formula` placeholders share one calculation.

| Domain | Instruments |
| --- | --- |
| Elementary number work | Signed number line, arithmetic/powers, place value and decimal decomposition (display rounded to three places), fraction operations, ratios, percentages, compatible measurement conversions, angles and turns |
| Algebra and functions | Linear equations and inequalities, sign reversal when dividing an inequality by a negative number, quadratic real/complex roots and degenerate cases, two-equation systems, arithmetic/geometric sequences, existing safe function plotting |
| Geometry and trigonometry | Rectangle/right-triangle/circle area and perimeter; cuboid/cylinder/sphere volume and surface area; unit circle; translation, axis reflections and counterclockwise rotation about the origin |
| Data and chance | Mean, median, repeated modes, range, population variance/standard deviation; probability that all specified draws are favourable, with or without replacement |

The nineteen instruments are reusable teaching tools across elementary through high school. They are not a complete authored curriculum, a general computer algebra system, or a proof checker. The AI can combine them with the existing shapes, graphs, cards, narration and prediction questions for broader explanations, and must label unsupported constructions as illustrations. Functions take radians; the unit-circle input takes degrees. Statistics explicitly use population spread. Measurement rejects conversion between different quantities. Invalid expressions, denominators and impossible urn counts are rejected or explained; division by zero is never presented as a finite result.

The old graph renderer also operates in Math Studio. Adding a graph to a quadratic or other worked example preserves the original calculation and its placeholders. Real scene text uses generated canvas textures that are disposed on replacement. Charts share one linear scale; if more than sixteen bars exist, their legend says that the display is truncated while calculations still use all supplied values.

Curriculum domains informed by the [Common Core mathematics standards](https://corestandards.org/mathematics-standards/), used as a coverage reference rather than a claim of full curriculum alignment. Quadratic domains follow the [OpenStax quadratic formula and discriminant treatment](https://openstax.org/books/college-algebra-2e/pages/2-5-quadratic-equations).

## Choosing an explanation

The capability registry now describes every existing science family. Context-aware recommendations are supplied to the director with the scene and conversation. Specific simulation language outranks generic illustration terms; explicit stage requests remain possible. Short parameter edits preserve the current experiment.

Regression cases include:

- “No gravity” and “10× stronger gravity” → bedroom; a gravity edit to an active mechanics/projectile experiment stays there.
- Newton's laws, acceleration, momentum and collisions → Mechanics Lab.
- Ocean waves, wind, water-wave interference and diffraction → workshop ripple tank.
- Fractions, equations, geometry, data and other supported school math → Math Studio.
- Changing the angle of an existing projectile → court; a lens angle → optics; a standalone math angle → Math Studio.

An enforced native-model recommendation is checked against validated commands before a streamed prefix can play. Wrong-stage or missing-instrument plans remain eligible for the existing one-round repair. If repair cannot produce a suitable plan, the app asks for clarification instead of presenting the unsuitable diagram as a simulation. This is a bounded guard, not a guarantee that every natural-language question is classified correctly.

## Wind and water

The workshop adds an optional `windSpeedMps` driver to `show_ripple_tank` and `set_module ripple` (`null` restores dipper mode). It drives a plane-wave source; zero wind is calm, and increasing it increases the illustrative forcing amplitude. The existing finite-difference propagation, barriers, water-depth dispersion and interference remain active.

The wind-to-amplitude mapping is **qualitative**, not calibrated to ocean wave height. It does not simulate wind duration, fetch growth, coupled turbulence, breaking waves or tsunami generation. These limits appear in the controls, AI instructions and offline demo. [NOAA](https://www.noaa.gov/jetstream/ocean/waves) identifies wind speed, duration and fetch as separate growth factors.

## Persistence and validation

The new world IDs are registered in the world menu/catalog, SSP, initial scene/module state and Firestore save allowlist. Existing worlds and absent optional modules remain compatible. Firestore rules require deployment separately; local source edits do not update production rules.

Tests cover analytic reference cases, collision/oscillator invariants, numerical singularities, routing and stream admission, actual player commands, placeholder resolution, save round-trips, desktop/phone controls, wind calm state and animated playback. Live local API checks also exercised bedroom gravity, Newton II, ocean wind waves and fraction addition with zero dropped commands. This records local verification, not a production release.

## Room and table interaction polish

Mechanics uses a furnished oak teaching room with side cabinets, storage, instruments, windows and cutaway walls. Carts retain a constant model size while track positions use a labeled linear display scale. Readouts wrap with padding and initialize when motion is disabled. Steep ramps and the longest supported pendulum fit the room.

Math Studio has its own pale tile/lavender palette and layout: side teaching wall, oval work island, fraction gallery, reading bench, abacus cabinet and drawing tools. The island stays present when a function graph is on the side wall. Windows have simple sky/sun views without protruding landscape triangles. Math Studio sits immediately above Math grid; Mechanics lab immediately above Workshop.

The periodic table keeps unselected tiles readable and permits orbit dragging without treating a drag as a selection. Selecting another tile does not reset a camera already in table view. Persistent Back to lab and Fit table controls provide a clear exit and intentional camera reset. Search covers 118 elements; the element card explains atomic number, neutral electron count and the distinction between abridged atomic weight and bracketed isotope mass number. Local guides highlight the selected element, its period and group/series, with a visible caption and Next control in the close view. They require no AI request and do not substitute an unrelated Bohr model for unsupported heavy elements.
