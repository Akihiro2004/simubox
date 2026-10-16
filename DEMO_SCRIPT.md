# Demo script (about 3.5 minutes)

**0:00 Open.** The bedroom diorama is already live. Simu waves and says hello. Drag to orbit: the walls nearest the camera lower so you can always see inside.

**0:20 Ask a "what if".** Type *What happens if gravity disappears in my bedroom?*
- Simu asks for a prediction first. Pick "Stay where it is".
- Gravity drops to zero. Point out that nothing moves until Simu gives a nudge, because objects at rest stay at rest (that's inertia). Then everything drifts and bounces off the walls.
- Drag the red ball and throw it. Show its live speed and mass in the selection card. Make it heavier and push it again.

**1:10 Real numbers.** Ask *Throw a basketball at 40 degrees at 20 km/h, how far does it go?*
- The camera frames the throw. Blue arrow: sideways speed (constant). Red arrow: up-and-down speed (gravity changes it).
- Labels show 3.10 m and 0.73 s. Say: these come from the physics engine, not the AI. The AI only writes `{{range}}` and the engine fills it in.
- Drag the angle slider to 45°, then 60°: it relaunches instantly with no AI call. Switch gravity to Moon.

**2:00 Chemistry.** Ask *Why is a water molecule bent?*
- Verified geometry from NIST data, the 104.5° angle drawn on the model, and lone pairs shown as soft clouds.
- Turn on "Compare two side by side" and add CO₂ to show straight versus bent.

**2:40 Guardrails and honesty.**
- Ask *Explain photosynthesis*: the answer is marked "Illustration", not "Live simulation".
- Ask something university-level or off-topic: Simu gently redirects to a school-level idea.
- Switch to Bahasa Indonesia in Settings and ask again.

**3:10 Google Cloud.** Gemini plans each lesson as validated JSON. The app runs on Cloud Run, calls Gemini through Vertex AI with no stored API key, and saves experiments to Firestore after Google sign-in.
