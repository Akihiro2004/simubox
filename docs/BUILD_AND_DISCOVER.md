# Build & Discover

## Product contract

Children can turn any world into their own learning space. The asset shop uses play coins only. Buying unlocks a reusable asset; placing more copies never charges again, and removing a copy never removes ownership. A starter balance and one-time learning rewards make the collection accessible without payments, ads, streaks or penalties for wrong answers.

The existing worlds remain starting templates. The editor can select existing furniture as well as shop objects, change transforms and colours, pin or release physical objects, duplicate, remove, undo and redo. Explicitly saved experiments already contain the full scene and retain each instance ID. The editor also keeps a local working map for each world, so changing worlds and reloading the browser need not discard a build.

## Implementation boundaries

- `world/learning-assets.ts`: original models defined as shared render/collider parts. Open structures have compound colliders, not solid bounding boxes.
- `builder/catalog.ts`: learning cards, categories, prices, starter ownership and concrete investigation prompts. Illustrative props declare their limitations.
- `builder/economy.ts`: versioned, validated browser wallet, reusable unlocks and one reward per learning card. This is a browser-local, non-monetary economy, not a secure cross-device currency service.
- `builder/maps.ts`: validated local map layouts, with stable instance IDs and bounded transforms. Existing experiment saves remain compatible.
- `builder/actions.ts`: edits, history, safe placement and map persistence, using the existing store and runtime.
- `components/builder/`: a separate shop/editor, not coupled to the concurrent morphing panels.

AI receives stable instance IDs, learner-placed flags and customized layout IDs. It can move or remove placed objects through the existing scene protocol. Same-world setup preserves a customized layout; other-world setup uses that world's saved layout. The validator and player must agree about those IDs. The AI may create teaching props without a coin charge; purchases are exclusively an explicit learner action.

## Learning and art

Physical construction pieces support gravity, collisions, stacking and buoyancy. Prisms, microscopes and renewable-energy models are labelled illustrations: no claim of ray tracing, magnification or electrical generation. Learning cards pair a prediction with a short explanation and a prompt that refers to the exact placed instance.

Original procedural assets preserve the current low-poly pastel style and require no additional model loader or external downloads. Future external candidates: [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) and [Quaternius](https://quaternius.com/faq.html), both published under CC0. No third-party models are included in this version.

## Verification

Unit checks cover part bounds, open colliders, prices and repeat purchases, reward idempotency, corrupt persistence, placement boundaries, duplicate IDs, history, customized-map AI commands and old experiment compatibility. Browser checks cover shop, quiz/reward, unlock/place, existing-furniture editing, undo, map switching/reload and phone layout. No production deployment or live model call is required to exercise the feature.

## Shop performance and thumbnails

All 36 thumbnails are baked PNGs (192 × 144, about 275 KiB combined), rendered from the exact same `AssetModel`, lights, camera and tone mapping as the interactive preview. No category icons or approximate drawings stand in for an asset. The shop does not generate thumbnails on a child's device. Images load lazily, the preview draws only on demand, the background world stops drawing while the shop is open, and UI chunks warm during browser idle time.

After changing a model, start the dev server and run `node scripts/generate-asset-thumbnails.mjs`. The development-only `/asset-studio` renders each model through one shared WebGL context. The script exports PNGs into `public/asset-thumbnails/`; that studio returns 404 in production.

## Local verification on 2026-10-17

- Full suite: 284 passing tests; 24 focused builder tests also passed after final edits. TypeScript and ESLint passed.
- Browser: earned 40 coins once, unlocked a marble for 30, placed it without another charge, edited an existing chair, dragged pinned furniture, exercised undo/redo, switched worlds and reloaded. Names and stable instance IDs survived. No runtime errors in the clean browser run.
- Shop: all 36 image sources are static; only the world and interactive preview have canvases. No horizontal page overflow in the narrow viewport. The dice thumbnail and live preview use the same model; screenshot in `docs/screenshots/build-and-discover-dice.png`.
- Production build was not run against the active shared dev server. No deployment, live model call or authenticated Firestore session was performed for this change. Coins and ownership are intentionally local to the browser; experiment saves keep their existing local/Firestore behavior.
