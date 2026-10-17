import { describe, expect, it } from "vitest";
import {
  OPTIC_PRESETS, TABLE, criticalAngle, fresnelReflectance, imageFormation, lightSpeedIn, objectRays, opticsPreset, presetIds, refractiveIndex, snellAngle, sourcePosition, traceOptics, wavelengthColor,
  type OpticsSetup, type V2,
} from "@/lib/engine/optics";

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("optics physics", () => {
  it("refractive indices follow real materials and disperse (violet bends more than red)", () => {
    near(refractiveIndex("water"), 1.333, 0.002);
    near(refractiveIndex("glass"), 1.517, 0.002);
    near(refractiveIndex("diamond"), 2.418, 0.003);
    near(refractiveIndex("air"), 1.0003, 0.0001);
    expect(refractiveIndex("glass", 405)).toBeGreaterThan(refractiveIndex("glass", 700));
  });

  it("Snell's law, critical angles and total internal reflection", () => {
    near(snellAngle(1, 1.5, 45)!, 28.1255, 1e-3);
    near(snellAngle(1, 1.5, 0)!, 0);
    near(criticalAngle(1.5, 1)!, 41.8103, 1e-3);
    near(criticalAngle(1.333, 1)!, 48.6066, 1e-3);
    expect(criticalAngle(1, 1.5)).toBeNull();
    expect(snellAngle(1.5, 1, 50)).toBeNull();
  });

  it("Fresnel: about 4% reflects straight off glass, everything past the critical angle", () => {
    near(fresnelReflectance(1, 1.5, 1), 0.04, 1e-9);
    near(fresnelReflectance(1.5, 1, Math.cos((60 * Math.PI) / 180)), 1);
    expect(fresnelReflectance(1, 1.5, Math.cos((80 * Math.PI) / 180))).toBeGreaterThan(0.3);
  });

  it("light is slower in glass and colours map to sensible RGB", () => {
    near(lightSpeedIn(1.5), 199_861_638.67, 1);
    expect(wavelengthColor(650)).toMatch(/^#ff[0-3]/);
    expect(wavelengthColor(532).slice(3, 5)).toBe("ff");
    expect(wavelengthColor(450).slice(5, 7)).toBe("ff");
  });

  it("thin lens and mirror equation: real, virtual and the focal point", () => {
    const real = imageFormation(1, 3);
    near(real.imageDistance!, 1.5);
    near(real.magnification!, -0.5);
    expect(real.description).toBe("real, upside down and smaller");
    const magnifier = imageFormation(1, 0.5);
    near(magnifier.imageDistance!, -1);
    near(magnifier.magnification!, 2);
    expect(magnifier.description).toBe("virtual, upright and larger");
    expect(imageFormation(1, 2).description).toBe("real, upside down and the same size");
    expect(imageFormation(1, 1).imageDistance).toBeNull();
    // A diverging lens always makes a smaller, upright, virtual image.
    const diverging = imageFormation(-1, 2);
    expect(diverging.real).toBe(false);
    expect(diverging.upright).toBe(true);
  });
});

const angleOf = (p: V2, q: V2) => (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI;

describe("ray tracer", () => {
  it("angle of incidence equals angle of reflection at a plane mirror", () => {
    for (const a of [10, 30, 55]) {
      const r = traceOptics(opticsPreset("reflection", { angleDeg: a }));
      const hit = r.hits.find((h) => h.kind === "reflect")!;
      near(hit.incidenceDeg, a, 1e-6);
      near(hit.outDeg!, a, 1e-6);
      const main = r.rays.find((x) => x.main)!;
      // The reflected beam leaves at 180° − a.
      near(Math.abs(angleOf(main.points[1], main.points[2])), 180 - a, 1e-6);
    }
  });

  it("refraction into a glass block matches Snell's law and comes out parallel", () => {
    const r = traceOptics(opticsPreset("refraction", { angleDeg: 40 }));
    const [enter, exit] = r.hits.filter((h) => h.kind === "refract");
    near(enter.incidenceDeg, 40, 1e-6);
    near(enter.outDeg!, snellAngle(enter.n1, enter.n2, 40)!, 1e-6);
    near(exit.outDeg!, 40, 1e-6);
    near(r.deviation!, 0, 1e-6);
    // Some light reflects off each face (a faint extra ray).
    expect(r.rays.some((x) => !x.main && x.intensity > 0.03 && x.intensity < 0.2)).toBe(true);
  });

  it("past the critical angle the semicircular block reflects all the light", () => {
    const tir = traceOptics(opticsPreset("total_internal_reflection", { angleDeg: 50 }));
    expect(tir.hits.some((h) => h.kind === "total_internal_reflection")).toBe(true);
    const below = traceOptics(opticsPreset("total_internal_reflection", { angleDeg: 30 }));
    expect(below.hits.some((h) => h.kind === "total_internal_reflection")).toBe(false);
    // The curved face is met head on, so the beam isn't bent there.
    expect(tir.hits[0].incidenceDeg).toBeLessThan(0.5);
  });

  it("an optical fibre carries light by bouncing inside it", () => {
    const r = traceOptics(opticsPreset("optical_fibre"));
    expect(r.hits.filter((h) => h.kind === "total_internal_reflection").length).toBeGreaterThanOrEqual(2);
  });

  it("a prism splits white light, bending violet more than red", () => {
    const r = traceOptics(opticsPreset("prism"));
    expect(r.spread).toBeGreaterThan(1);
    expect(r.spread).toBeLessThan(6);
    expect(r.deviation).toBeGreaterThan(30);
    const spots = r.spots.filter((s) => s.elementId === "screen");
    expect(new Set(spots.map((s) => s.color)).size).toBeGreaterThanOrEqual(7);
  });

  it("parallel rays meet at the focal point of a convex lens and spread from a concave one", () => {
    const setup = opticsPreset("convex_lens");
    const lens = setup.elements[0];
    const r = traceOptics(setup);
    for (const ray of r.rays.filter((x) => x.points.length >= 3)) {
      const [, p, q] = ray.points;
      // Where the outgoing ray crosses the axis (z = 0).
      const t = -p[1] / (q[1] - p[1] || 1e-12);
      if (Math.abs(p[1]) > 1e-6) near(p[0] + (q[0] - p[0]) * t, lens.x + lens.focalLength, 1e-6);
    }
    const spread = traceOptics(opticsPreset("concave_lens")).rays.filter((x) => Math.abs(x.points[1][1]) > 0.1);
    for (const ray of spread) expect(Math.sign(ray.points[2][1] - ray.points[1][1])).toBe(Math.sign(ray.points[1][1]));
  });

  it("a concave mirror focuses parallel rays near F; a convex one spreads them", () => {
    const setup = opticsPreset("concave_mirror");
    const m = setup.elements[0];
    const r = traceOptics(setup);
    const crossings = r.rays.filter((x) => Math.abs(x.points[1][1]) > 0.05).map((x) => {
      const [, p, q] = x.points;
      return p[0] + (q[0] - p[0]) * (-p[1] / (q[1] - p[1]));
    });
    expect(crossings.length).toBeGreaterThan(2);
    for (const c of crossings) near(c, m.x - m.focalLength, 0.05);
    const convex = traceOptics(opticsPreset("convex_mirror")).rays.filter((x) => Math.abs(x.points[1][1]) > 0.1);
    for (const ray of convex) expect(Math.sign(ray.points[2][1] - ray.points[1][1])).toBe(Math.sign(ray.points[1][1]));
  });

  it("ray diagrams: the principal rays from an object meet at the image the formula predicts", () => {
    const setup = opticsPreset("lens_image");
    const d = objectRays(setup)!;
    expect(d.result.real).toBe(true);
    const r = traceOptics(setup);
    const diagram = r.rays.filter((x) => x.diagram);
    expect(diagram.length).toBe(3);
    for (const ray of diagram) {
      const [, p, q] = ray.points;
      const t = (d.image!.tip[0] - p[0]) / (q[0] - p[0]);
      near(p[1] + (q[1] - p[1]) * t, d.image!.tip[1], 1e-6);
    }
    const virtual = objectRays(opticsPreset("magnifier"))!;
    expect(virtual.result.description).toBe("virtual, upright and larger");
    expect(virtual.image!.real).toBe(false);
  });

  it("an aimed source keeps hitting its target and stays on the table", () => {
    for (const a of [-170, -60, 0, 35, 80, 150]) {
      const setup = opticsPreset("reflection", { angleDeg: a });
      const p = sourcePosition(setup.source, setup.elements);
      expect(Math.abs(p[0])).toBeLessThanOrEqual(TABLE.x + 1e-9);
      expect(Math.abs(p[1])).toBeLessThanOrEqual(TABLE.z + 1e-9);
    }
  });

  it("every preset traces in bounds, terminates, and its ids are unique", () => {
    for (const p of OPTIC_PRESETS) {
      const setup = opticsPreset(p);
      const ids = presetIds(p);
      expect(new Set(ids).size).toBe(ids.length);
      const r = traceOptics(setup);
      expect(r.rays.length).toBeLessThanOrEqual(160);
      for (const ray of r.rays) for (const [x, z] of ray.points) {
        expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(TABLE.x + 1e-6);
        expect(Math.abs(z)).toBeLessThanOrEqual(TABLE.z + 1e-6);
      }
    }
  });

  it("two facing mirrors don't trap the tracer in an endless loop", () => {
    const setup: OpticsSetup = {
      ...opticsPreset("free"),
      elements: [
        { id: "a", kind: "plane_mirror", x: -1, z: 0, rotationDeg: 0, size: 3, focalLength: 1, material: "glass" },
        { id: "b", kind: "plane_mirror", x: 1, z: 0, rotationDeg: 0, size: 3, focalLength: 1, material: "glass" },
      ],
    };
    setup.source = { ...setup.source, x: 0, z: 0, angleDeg: 0 };
    const r = traceOptics(setup);
    expect(r.rays[0].points.length).toBeLessThanOrEqual(42);
  });
});
