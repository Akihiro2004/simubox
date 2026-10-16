# Map rendering and editable furnishings

The map pass is confined to `src/components/world`, the world catalog/layout, and focused tests. It does not change the AI director, command player, state store, persistence, lesson logic, or API routes.

## Scene contract

`initialObjects(world)` now supplies furniture as ordinary named `SceneObject` assets. The catalog includes bed, desk, chair, bookcase, cabinet, bench, planter, reading lamp, garden fence, and display pedestal. The existing catalog-generated AI prompt and asset enum discover them automatically.

These objects support the existing move, rotate, color, scale, visibility, selection, removal, focus, save, and world-loading paths. They start with static physics. The existing Reset action resets transforms of surviving objects and preserves removals; reloading a world restores its complete starting layout.

`furnishings.ts` contains local-space part dimensions. Both rendering and compound colliders consume the same parts. Table legs and tops have separate colliders, so the space underneath stays open. Scaled collider mass is apportioned across parts, and colliders are owned by the scene object rather than duplicated in fixed scenery.

Room shells, cutaway wall finishes, windows, artwork, flooring, pond/path details, and distant court landscaping remain architectural scenery. They are not individual command targets. World bounds and experimental coordinates are unchanged. This is not an arbitrary architecture editor.

## Rendering

The maps use procedural geometry with no downloaded assets, fonts, or texture requests. Static oak planks, grass, and flower details use instancing. Existing quality/shadow controls and reduced-motion behavior remain active. Camera home framing leaves space for wall caps and refits when the viewport changes; orbiting and object focus still use the existing camera controller.

## Verification

`tests/unit/furnishings.test.ts` covers unique/default IDs, placement bounds, lesson object headroom, model/collider extents, AI catalog discovery, scene-command validation after world loading, and independent default transforms.

For a visual check: load each world, select and remove furniture, reload the world, orbit through the cutaway walls, inspect desktop/mobile framing, and launch a projectile. Live model-generated plans and arbitrary rearrangements require separate end-to-end evaluation; schema acceptance alone is not a guarantee of every AI-generated placement.
