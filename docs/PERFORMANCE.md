# Rendering and loading efficiency

The studio keeps the existing geometry, materials, textures, lighting, shadow
sizes, pixel ratios and quality presets. These optimizations remove work that
does not affect the displayed result.

- `world/science-modules.tsx` loads science renderers only when their module is
  active. A bedroom visit no longer downloads the Earth atlas, orbit renderer,
  wave-field renderer, optics renderer or the two learning-lab renderers.
  Loaded chunks are cached by the browser. A local Suspense boundary keeps the
  room and physics mounted while an experiment loads, with a small status label.
  A local error boundary offers recovery if the download fails and keeps map
  navigation available.
- `usePageVisible` suspends studio frames in hidden tabs. Physics follows the
  canvas loop, so it also stops. It does not change the learner's Pause setting.
  The animation clock stays continuous when rendering resumes. Performance
  monitoring restarts after suspension so background time cannot lower quality.
- Ripple geometry and signal textures update while waves run or their inputs
  change. Paused, reduced-motion and signal strength-only views reuse their
  existing GPU data. Resolution, wave solver and settled patterns are unchanged.
- Mechanics stops calculating and updating transforms at an unchanged time,
  including the completed endpoint. Board textures regenerate only when their
  contents or appearance change, rather than on an unrelated parent render.
- Home waits for the session check before mounting its 3D landing stage. A
  returning signed-in user goes to the studio without building that scene.

## Measurements

On 2026-10-18, two fresh isolated Chromium contexts loaded `/app` on the same
running Next development server at 1280 × 800, medium quality and reduced
motion. After the canvas appeared, each capture waited five seconds. Summing
decoded response bodies for JavaScript requests gave:

| Fresh bedroom visit | Decoded JavaScript |
| --- | ---: |
| Before conditional renderer imports | 19,297,213 bytes |
| After conditional renderer imports | 18,389,576 bytes |
| Difference | 907,637 bytes (4.7%) |

These are development-server observations, not compressed transfer sizes,
production bundle measurements, or a guaranteed startup-time improvement.

`tests/e2e/render-efficiency.spec.ts` observes actual WebGL draw submissions and
large buffer uploads. It checks hidden/resumed rendering and unchanged ripple
buffers, then tours all maps with Chromium's 4× CPU throttling. Visibility is
simulated in the isolated test context; app code has no test instrumentation.
The existing lab, landing and authentication tests cover related controls and
loading behavior on desktop and phone layouts.

Validation on that date: 441 unit tests and 24 distinct desktop/phone browser
checks passed across focused runs. TypeScript, targeted ESLint and whitespace
checks passed. A production build was not run alongside the shared development
server; production size and timing comparisons remain unverified.

CPU throttling and phone viewports do not emulate a weak physical GPU, memory
pressure, battery throttling or every mobile browser. Active wave solvers and
large customized scenes can still be expensive. The existing adaptive quality
setting remains available. Verify production loading and frame pacing on real
target devices before claiming a minimum supported device or frame rate.

## References

- [Installed Next lazy-loading guide](../node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md)
- [React lazy and Suspense](https://react.dev/reference/react/lazy)
- [React Three Fiber performance guidance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
