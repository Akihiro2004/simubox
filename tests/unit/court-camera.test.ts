import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { fitCourtFlight, VIEW_SAFE } from "@/lib/world/camera-framing";
import type { Vec3 } from "@/lib/world/catalog";

describe("court flight framing", () => {
  it.each([.46, .75, 1, 1.6, 2.4])("keeps launch, apex, landing and guide in view at aspect %s", aspect => {
    for (const range of [0, 4, 27, 60, 250]) {
      const points: Vec3[] = [[-2.2, 0, 2.2], [-1.5, 2.4, 2.2], [0, 1, 0], [range / 2, range / 4 + 1, 0], [range, 1, 0]];
      const fit = fitCourtFlight(points, 32, aspect, new Vector3(-.1, .5, 1));
      const camera = new PerspectiveCamera(32, aspect, .1, 3000);
      camera.position.copy(fit.position); camera.lookAt(fit.target); camera.updateMatrixWorld();
      for (const point of points) {
        const q = new Vector3(...point).project(camera);
        expect(q.x).toBeGreaterThan(VIEW_SAFE.left); expect(q.x).toBeLessThan(VIEW_SAFE.right);
        expect(q.y).toBeGreaterThan(VIEW_SAFE.bottom); expect(q.y).toBeLessThan(VIEW_SAFE.top);
        expect(q.z).toBeLessThan(1);
      }
    }
  });
});
