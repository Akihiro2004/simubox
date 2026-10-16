# Map rendering and editable furnishings

The map pass is confined to `src/components/world`, the world catalog/layout, and focused tests. It does not change the AI director, command player, state store, persistence, lesson logic, or API routes.

## Scene contract

`initialObjects(world)` supplies furniture as ordinary named `SceneObject` assets. The catalog includes bed, desk, chair, bookcase, cabinet, bench, planter, reading lamp, garden fence, display pedestal, bedside cabinet, stool, workbench, instrument trolley, and storage basket. The existing catalog-generated AI prompt and asset enum discover them automatically.

These objects support the existing move, rotate, color, scale, visibility, selection, removal, focus, save, and world-loading paths. They start with static physics. The existing Reset action resets transforms of surviving objects and preserves removals; reloading a world restores its complete starting layout.

`furnishings.ts` contains local-space part dimensions. Both rendering and compound colliders consume the same parts. Table legs and tops have separate colliders, so the space underneath stays open. Scaled collider mass is apportioned across parts, and colliders are owned by the scene object rather than duplicated in fixed scenery.

Room shells, cutaway wall finishes, windows, artwork, flooring, pond/path details, and distant court landscaping remain architectural scenery. They are not individual command targets. World bounds and experimental coordinates are unchanged. This is not an arbitrary architecture editor.

## Rendering

The maps use procedural geometry with no downloaded assets, fonts, or texture requests. Static oak planks, grass, and flower details use instancing. Existing quality/shadow controls and reduced-motion behavior remain active. Camera home framing leaves space for wall caps and refits when the viewport changes; orbiting and object focus still use the existing camera controller.

The ten worlds share material and lighting conventions, with warmer interior fill and cooler observatory light. `surfaces.ts` caches deterministic wood, woven, and stone relief textures. `scenery.tsx` contains the added architectural details: pond edging and pavers, court borders and lamps, observatory calibration marks, tank framing and habitat details, graph-board trim, compass inlays, and wall-mounted workshop tools. These details keep the science modules' original coordinates.

The workshop workbench is now a scene asset with compound colliders. Its pegboard belongs to the cutaway wall, so orbiting hides it with that wall. The bedroom bookcase has been moved left to clear the window curtains; extra shelf and bedside props are independent editable objects. Existing saved scenes preserve their saved objects; reload a world for its complete new default layout.

## Verification

The court now includes editable covered stands and a ball rack, painted side lanes and distance labels, a launch circle, and a landscaped concourse. Near-side trees were removed from the launcher sight line. Court experiment coordinates remain unchanged.

The park uses shared placement data in `park-layout.ts`, curved paths and an organic pond in `garden-park.tsx`, and individually editable shrubs, ferns, and a pergola. Old saved layouts retain their old objects; reloading the world supplies the redesigned garden.

Ocean fish are normal scene assets with `physics: "none"`. `fishPose` computes a bounded visual patrol around their editable home position; the runtime node follows the fish, so focus, selection rings, and snapshots use its live position. Fish, tail motion, bubbles, and water surface motion respect Pause and reduced motion. Coral, kelp, anemones, and the stone arch use the existing asset commands. Buoyancy calculations are unchanged.

The workshop lever and wave displays occupy the central demonstration area. The work mat moves and resizes for Circuit, Lever, and Wave rather than remaining behind an inactive experiment. Only their presentation coordinates changed.

The lab wall's periodic table contains all 118 elements, atomic numbers, names and abridged weights from the IUPAC 4 May 2022 reference. Detached La–Lu and Ac–Lr rows retain their actual periods. Bracketed values are isotope mass numbers; the board omits weight uncertainties and identifies the dated reference. It uses one generated canvas texture, disposed when replaced, with no remote font or texture dependency.

`show_periodic_table` is a validated SSP command that loads the lab when needed, clears the obstructing pedestal display and faces the board. `elements`, `groups`, `periods`, `caption` and `marks` edit its lesson state in `modules.periodicTable`; omitted fields preserve previous layers, supplied arrays replace them. `focus:false` edits ink without changing the view or pedestal. Marks support element-anchored circles/arrows, normalized board coordinates, text and polylines. State travels through the existing snapshot/save/replay path. `clear_annotations` and the Clear table markings control clear the ink; physics Reset preserves module parameters as before, while reloading the world resets them. Building a new pedestal model restores the room view.

Students can click the board or use Lab → Table and its keyboard-accessible element selector. The table camera refits on resize, reserves room for desktop controls and faces the board squarely. The explanation card collapses to Read explanation while studying the table so it does not cover the cells. A real model-generated fluorine/chlorine lesson was checked from the bedroom through API validation, lab loading, camera movement and on-board markings. Unit coverage includes all 118 cell positions, family/period selection, rejected drawing inputs, cross-world playback and clearing/reloading.

`tests/unit/furnishings.test.ts` covers unique/default IDs, placement bounds, lesson object headroom, model/collider extents, AI catalog discovery, scene-command validation after world loading, and independent default transforms.

For a visual check: load each world, select and remove furniture, reload the world, orbit through the cutaway walls, inspect desktop/mobile framing, and launch a projectile. Live model-generated plans and arbitrary rearrangements require separate end-to-end evaluation; schema acceptance alone is not a guarantee of every AI-generated placement.
