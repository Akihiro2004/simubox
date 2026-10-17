import { Color } from "three";
import type { TraceResult } from "@/lib/engine/optics";

/** Build line/arrow buffers only when the optical setup changes. */
export function opticsBeamBuffers(trace: TraceResult, reflections = true) {
  const positions: number[] = [], colors: number[] = [], arrows: number[] = [], arrowColors: number[] = [];
  const sourceSamples = Math.max(1, trace.rays.filter((ray) => !ray.secondary && !ray.diagram).length);
  const color = new Color();
  for (const ray of trace.rays) {
    if (ray.secondary && !reflections) continue;
    for (let i = 0; i < ray.points.length - 1; i++) {
      const a = ray.points[i], b = ray.points[i + 1];
      const power = ray.segmentIntensities[i] ?? ray.intensity;
      const relative = Math.min(1, power * (ray.diagram ? 1 : sourceSamples));
      // Brightness is a visibility aid; numeric power readings use the unmodified trace.
      color.set(ray.color).multiplyScalar(Math.sqrt(relative));
      positions.push(a[0], 0.07, a[1], b[0], 0.07, b[1]);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      if (!ray.main || ray.secondary || length < 0.18) continue;
      const ux = dx / length, uz = dz / length, x = a[0] + dx * 0.62, z = a[1] + dz * 0.62;
      arrows.push(x + ux * 0.045, 0.075, z + uz * 0.045, x - ux * 0.03 - uz * 0.025, 0.075, z - uz * 0.03 + ux * 0.025, x - ux * 0.03 + uz * 0.025, 0.075, z - uz * 0.03 - ux * 0.025);
      for (let j = 0; j < 3; j++) arrowColors.push(color.r, color.g, color.b);
    }
  }
  return { positions, colors, arrows, arrowColors };
}
