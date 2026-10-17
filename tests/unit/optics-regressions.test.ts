import { describe, expect, it } from "vitest";
import { clipTableSegment, fresnelReflectance, objectRays, opticsPreset, outlineOf, refractiveIndex, traceOptics } from "@/lib/engine/optics";
import { opticsBeamBuffers } from "@/lib/world/optics-display";

describe("optics audit regressions", () => {
  it("reports the same focal point for rays travelling through a lens from the opposite side", () => {
    const setup = opticsPreset("convex_lens");
    setup.source.x = 2.5; setup.source.angleDeg = 180;
    const result = traceOptics(setup);
    for (const ray of result.rays.filter((r) => Math.abs(r.points[1][1]) > 0.01)) {
      const [, a, b] = ray.points;
      const crossing = a[0] - a[1] * (b[0] - a[0]) / (b[1] - a[1]);
      expect(crossing).toBeCloseTo(setup.elements[0].x - setup.elements[0].focalLength, 8);
    }
  });

  it("normal incidence through a glass slab conserves captured screen power, including faint internal returns", () => {
    const setup = opticsPreset("refraction", { angleDeg: 0 });
    setup.elements.push({ ...setup.elements[0], id: "screen", kind: "screen", x: 2.4, size: 2.8 });
    const result = traceOptics(setup);
    const R = fresnelReflectance(refractiveIndex("air", 650), refractiveIndex("glass", 650), 1);
    const captured = result.spots.reduce((sum, spot) => sum + spot.intensity, 0);
    expect(captured).toBeLessThanOrEqual(1);
    expect(captured).toBeCloseTo((1 - R) / (1 + R), 2);
  });

  it("white ray-box power remains one and a blocking card removes the correct point-source rays", () => {
    const setup = opticsPreset("free", { color: "white" });
    setup.source.kind = "ray_box"; setup.source.rays = 9;
    expect(traceOptics(setup).rays.reduce((sum, ray) => sum + ray.intensity, 0)).toBeCloseTo(1, 10);
    const shadow = traceOptics(opticsPreset("shadows"));
    expect(shadow.spots.reduce((sum, spot) => sum + spot.intensity, 0)).toBeCloseTo(2 / 9, 8);
  });

  it("the actual wavelength changes dispersion and suppresses a white spectrum when explicitly set", () => {
    const red = opticsPreset("refraction"); red.source.wavelengthNm = 700;
    const violet = opticsPreset("refraction"); violet.source.wavelengthNm = 405;
    expect(traceOptics(violet).hits[0].outDeg!).toBeLessThan(traceOptics(red).hits[0].outDeg!);
    const mono = opticsPreset("prism"); mono.source.wavelengthNm = 532;
    expect(traceOptics(mono).spread).toBeNull();
    expect(traceOptics(mono).rays.every((ray) => ray.nm === 532)).toBe(true);
  });

  it("spherical mirror outlines stay on their physical circle at extreme focal lengths", () => {
    const setup = opticsPreset("concave_mirror");
    const mirror = { ...setup.elements[0], focalLength: 0.2, size: 4.8 };
    for (const [x, z] of outlineOf(mirror)) expect((x - 0.4) ** 2 + z ** 2).toBeCloseTo(0.16, 8);
  });

  it("clips virtual constructions and packs arbitrary ray counts into three render buffers", () => {
    expect(clipTableSegment([0, 0], [100, 0])).toEqual([[0, 0], [2.8, 0]]);
    expect(clipTableSegment([4, 4], [5, 5])).toBeNull();
    const trace = traceOptics(opticsPreset("prism"));
    const all = opticsBeamBuffers(trace), primary = opticsBeamBuffers(trace, false);
    expect(all.positions.length).toBeGreaterThan(primary.positions.length);
    expect(all.positions.length).toBe(all.colors.length);
    expect(all.positions.every(Number.isFinite)).toBe(true);
    expect(all.arrows.length).toBe(all.arrowColors.length);
    for (const ray of trace.rays) expect(ray.segmentIntensities.length).toBe(ray.points.length - 1);
  });
  it("equal media have no Fresnel reflection, including grazing incidence", () => {
    expect(fresnelReflectance(1.5, 1.5, 0)).toBe(0);
    expect(fresnelReflectance(1.5, 1.5, 0.5)).toBe(0);
  });

  it("a source inside glass starts in glass and can totally internally reflect", () => {
    const setup = opticsPreset("refraction");
    setup.source = { ...setup.source, x: 0, z: 0, angleDeg: 50, aimAt: null };
    const result = traceOptics(setup);
    expect(result.hits[0].n1).toBeCloseTo(refractiveIndex("glass", 650), 8);
    expect(result.hits[0].kind).toBe("total_internal_reflection");
  });

  it("white source power is conserved instead of being multiplied by the wavelength count", () => {
    const setup = opticsPreset("free", { color: "white" });
    const trace = traceOptics(setup);
    expect(trace.rays.reduce((sum, ray) => sum + ray.intensity, 0)).toBeCloseTo(1, 10);
  });

  it("each transmitted segment loses exactly the power sent into its reflected branch", () => {
    const setup = opticsPreset("refraction", { angleDeg: 0 });
    const trace = traceOptics(setup);
    const primary = trace.rays.find((ray) => ray.main)!;
    expect(primary.segmentIntensities[0]).toBeCloseTo(1, 10);
    expect(primary.segmentIntensities[1]).toBeLessThan(primary.segmentIntensities[0]);
    expect(primary.segmentIntensities[2]).toBeLessThan(primary.segmentIntensities[1]);
    const reflections = trace.rays.filter((ray) => !ray.main);
    expect(primary.segmentIntensities[1] + reflections[0].intensity).toBeCloseTo(1, 10);
  });

  it("an object at a plane mirror gives an equal-size virtual image behind it", () => {
    const setup = opticsPreset("reflection");
    setup.elements[0].rotationDeg = 180;
    setup.source.kind = "off";
    setup.object = { target: "mirror", distance: 1, height: 0.2 };
    const diagram = objectRays(setup)!;
    expect(diagram.result.imageDistance).toBe(-1);
    expect(diagram.result.magnification).toBe(1);
    expect(diagram.image!.base[0]).toBeCloseTo(1.9, 10);
    for (const ray of traceOptics(setup).rays.filter((ray) => ray.diagram)) {
      const [, p, q] = ray.points;
      const t = (diagram.image!.tip[0] - p[0]) / (q[0] - p[0]);
      expect(p[1] + t * (q[1] - p[1])).toBeCloseTo(diagram.image!.tip[1], 8);
    }
  });
});
