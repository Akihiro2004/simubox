# SimuBox

**Ask anything. Watch it come to life.**

SimuBox is a chat box that answers in 3D. A student (primary to high school) types a science question, and Gemini directs a short lesson inside a small isometric diorama: it picks a world, sets up a real experiment, spawns objects and characters, and Simu the robot explains what is happening. The student can then orbit the camera, drag and throw objects, change sliders, and ask follow-ups without the scene resetting.

Built for the [AI Builder Cup 2026](https://aibuildercup.com/) on Google Cloud.

## What actually works

| Feature | How it works | Status |
| --- | --- | --- |
| Gravity and forces (bedroom) | Rapier rigid-body physics; gravity presets from zero to Jupiter; impulses; drag to pick up and throw; per-object mass and bounciness | Working |
| Projectile motion (court) | Exact analytic equations (no drag, launch height supported); km/h, m/s, mph; sliders relaunch instantly without AI | Working, 120+ numeric tests |
| Molecules and atoms (lab) | Curated geometry for H₂O, CO₂, CH₄, NH₃, O₂, N₂, H₂, HCl from NIST data; lone pairs; measured bond-angle arcs; Bohr-model atoms H to Ca (labelled simplified) | Working |
| Other topics | Gemini builds a labelled illustration from catalog objects, shapes, arrows and characters, and marks it "Illustration", never "simulation" | Needs a Gemini key to try |
| Gemini director | Structured JSON plan validated by Zod; bad commands dropped individually; one repair round; numbers only via engine placeholders like `{{range}}` | Code complete; live calls need a key |
| Guardrails | Deterministic pre-filter for clearly unsafe prompts; Gemini classifies `too_advanced`, `off_topic`, `unsafe`, `needs_clarification`; prompt-injection-resistant system prompt | Working (pre-filter tested) |
| Teaching | Characters with speech bubbles, narrator captions, prediction questions, read-aloud (browser voice), English and Bahasa Indonesia | Working |
| Rooms you can walk around | Four walls; the walls facing the camera lower into a baseboard as you orbit | Working |
| Accounts and saving | Google sign-in with Firebase Auth; experiments in Firestore with owner-only rules; guests save to the browser | Code complete; needs a Firebase project |
| Lesson upload | PDF or text read by Gemini in memory (never stored), turned into suggested questions | Needs a Gemini key |
| Offline demos | When no AI is configured, the three core prompts play pre-written lessons clearly badged "Offline demo" | Working |

## Architecture

```
Browser (Next.js client)                          Cloud Run (Next.js server)
┌──────────────────────────────────────┐         ┌───────────────────────────────┐
│ Composer ──ask()────────────────────────────▶ │ /api/ai/plan                    │
│   scene snapshot + recent turns      │         │  rate limit, verify Firebase   │
│                                      │         │  token, guard pre-filter       │
│                                      │         │  Gemini (structured JSON)      │
│ SimuPlayer ◀──── validated ScenePlan ──────── │  Zod validation + repair        │
│  runs commands in order, cancellable │         └───────────────────────────────┘
│  ├─ SimuWorld (R3F scene, cutaway)   │
│  ├─ SimuEngine (Rapier, projectile,  │         Firebase Auth + Firestore
│  │   chemistry: all numbers)         │◀──────▶ users/{uid}/experiments/{id}
│  └─ Teaching UI (bubbles, TTS, cards)│
└──────────────────────────────────────┘
```

- `src/lib/ssp/` — the SimuBox Scene Protocol: Zod schemas for ~30 commands and the plan, plus the validator.
- `src/lib/ai/` — system prompt, capability registry and matcher, guardrails, Gemini director, offline demo plans.
- `src/lib/engine/` — projectile maths and curated chemistry data (pure, unit-tested).
- `src/lib/player.ts` — executes plans against the scene; fills `{{placeholders}}` from engine results.
- `src/components/world/` — the 3D worlds, objects, characters and labels.
- `src/components/ui/` — composer, Simu's answer card, controls rail, menu and settings.

The model never writes code or coordinates for science. It picks from a catalog, and the deterministic engines supply geometry and numbers.

## Run locally

Requires Node 22.

```bash
npm install
cp .env.example .env.local   # add GEMINI_API_KEY to use live Gemini
npm run dev
```

Without `GEMINI_API_KEY` the app still runs: the three core questions play offline demos, badged as such.

## Tests

```bash
npm test             # unit tests: physics, chemistry, protocol, guardrails, cutaway
npm run test:e2e     # Playwright against the production build (run `npm run build` first)
npm run lint
```

## Deploy to Google Cloud Run

The app ships as a container (`Dockerfile`: multi-stage Node 22, Next.js standalone server on port 8080). Cloud Build builds it remotely during deploy, so a local Docker install is optional.

```powershell
# Vertex AI with the service's own identity (no key stored)
./scripts/deploy.ps1 -Project YOUR_PROJECT_ID -Region asia-southeast1

# Or use your AI Studio key: read from GEMINI_API_KEY or .env.local and stored in Secret Manager
./scripts/deploy.ps1 -Project YOUR_PROJECT_ID -UseApiKey
```

The script enables the needed APIs, creates a least-privilege runtime service account (`roles/aiplatform.user`, plus secret access with `-UseApiKey`), and deploys with scale-to-zero and at most 3 instances to cap spending. Add `-FirebaseApiKey`, `-FirebaseAuthDomain`, `-FirebaseAppId` (and `-FirebaseProjectId` if Firebase lives in another project) to turn on sign-in.

To test the container locally (Docker Desktop running):

```powershell
docker build -t simubox .
docker run --rm -p 8080:8080 --env-file .env.local simubox   # then open http://localhost:8080
```

### Firebase (optional, for accounts)

1. Add Firebase to the Google Cloud project, create a web app, and enable Google sign-in under Authentication.
2. Add your Cloud Run domain under Authentication → Settings → Authorized domains.
3. Deploy the security rules: `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`.

## Limits and honesty notes

- Physics uses small air drag as a stand-in for air resistance; projectiles assume no air drag at all. Assumptions are shown in each lesson.
- Atom models are the simplified Bohr picture and are labelled that way.
- Rate limiting is in memory per Cloud Run instance. That's fine for a demo; a shared store would be needed at scale.
- All 3D models are original, built from primitives in code (see [ASSET_CREDITS.md](ASSET_CREDITS.md)).
