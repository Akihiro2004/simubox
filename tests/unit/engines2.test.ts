import { describe, expect, it } from "vitest";
import { PLANETS, PLANET_IDS, displayDistance, keplerRatio, moonIllumination, moonPhaseName, orbitAngle, seasonNorth, subsolarLatitude } from "@/lib/engine/astro";
import { PLACES, distanceKm, latLonToVec3, solarTimeOffset } from "@/lib/engine/geo";
import { FLUIDS, MATERIALS, buoyantForce, floatFraction, floats, phaseAt, rmsSpeed, solveCircuit, solveLever, sphereSubmerged, waveDisplacement, waveSpeed } from "@/lib/engine/physics2";
import { compileExpression, isValidExpression, sampleExpression } from "@/lib/engine/expr";
import { measureShape, polygonArea } from "@/lib/engine/geometry";
import { CELL_PARTS, ORGANELLES } from "@/lib/engine/biology";

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe("astronomy", () => {
  it("every planet obeys Kepler's third law (T² ∝ a³)", () => {
    for (const id of PLANET_IDS) near(keplerRatio(PLANETS[id]), 1, 0.01);
  });
  it("orbits and display distances are ordered and periodic", () => {
    const d = PLANET_IDS.map((id) => displayDistance(PLANETS[id].distanceAU));
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
    near(orbitAngle(365.26, 365.26), 0);
    near(orbitAngle(100, 25), Math.PI / 2);
  });
  it("moon phases", () => {
    near(moonIllumination(0), 0);
    near(moonIllumination(29.53 / 2), 1);
    expect(moonPhaseName(0)).toBe("New moon");
    expect(moonPhaseName(29.53 / 2)).toBe("Full moon");
    expect(moonPhaseName(29.53 / 4)).toBe("First quarter");
  });
  it("seasons follow Earth's tilt", () => {
    near(subsolarLatitude(80), 0, 1e-9);
    near(subsolarLatitude(171.3), 23.44, 0.01);
    expect(subsolarLatitude(355)).toBeLessThan(-23);
    expect(seasonNorth(190)).toBe("summer");
    expect(seasonNorth(10)).toBe("winter");
  });
});

describe("geography", () => {
  it("lat/lon maps onto the sphere consistently", () => {
    const [x, y, z] = latLonToVec3(0, 0, 1);
    near(x, 1);
    near(y, 0);
    near(z, 0);
    near(latLonToVec3(90, 123, 2)[1], 2);
    near(latLonToVec3(0, 90, 1)[2], -1);
    for (const p of PLACES) expect(Math.hypot(...latLonToVec3(p.lat, p.lon, 3))).toBeCloseTo(3, 9);
  });
  it("distances between real cities", () => {
    const by = (id: string) => PLACES.find((p) => p.id === id)!;
    // London to New York is about 5,570 km; Jakarta to Singapore about 880 km.
    near(distanceKm(by("london"), by("new_york")), 5570, 40);
    near(distanceKm(by("jakarta"), by("singapore")), 880, 30);
    expect(solarTimeOffset(by("tokyo").lon)).toBe(9);
    for (const p of PLACES) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
    }
  });
});

describe("buoyancy", () => {
  it("floats what is less dense than the fluid", () => {
    expect(floats(MATERIALS.wood.density, FLUIDS.fresh_water.density)).toBe(true);
    expect(floats(MATERIALS.steel.density, FLUIDS.sea_water.density)).toBe(false);
    near(floatFraction(MATERIALS.ice.density, FLUIDS.fresh_water.density), 0.917);
    near(floatFraction(MATERIALS.wood.density, FLUIDS.fresh_water.density), 0.5);
    expect(floatFraction(MATERIALS.gold.density, FLUIDS.fresh_water.density)).toBe(1);
    // An egg sinks in fresh water but floats in very salty water.
    expect(floats(MATERIALS.egg.density, FLUIDS.fresh_water.density)).toBe(false);
    expect(floats(MATERIALS.egg.density, FLUIDS.very_salty_water.density)).toBe(true);
    expect(() => floatFraction(0, 1000)).toThrow();
  });
  it("Archimedes with a spherical cap", () => {
    const r = 0.1;
    near(sphereSubmerged(r, 2 * r), (4 / 3) * Math.PI * r ** 3, 1e-12);
    near(sphereSubmerged(r, r), (2 / 3) * Math.PI * r ** 3, 1e-12);
    near(sphereSubmerged(r, -1), 0);
    // A fully submerged 1 litre displaces 1 kg of water: ~9.81 N.
    near(buoyantForce(1000, 9.81, 0.001), 9.81, 1e-9);
  });
});

describe("circuits (Ohm's law)", () => {
  it("series", () => {
    const r = solveCircuit({ layout: "series", voltage: 6, resistances: [10, 10], closed: true });
    near(r.totalResistance, 20);
    near(r.current, 0.3);
    near(r.branches[0].voltage, 3);
    near(r.totalPower, 1.8);
  });
  it("parallel", () => {
    const r = solveCircuit({ layout: "parallel", voltage: 6, resistances: [10, 10], closed: true });
    near(r.totalResistance, 5);
    near(r.current, 1.2);
    near(r.branches[1].current, 0.6);
    near(r.branches[0].brightness, 1);
  });
  it("adding bulbs dims series and not parallel", () => {
    const s1 = solveCircuit({ layout: "series", voltage: 6, resistances: [10], closed: true }).branches[0].brightness;
    const s3 = solveCircuit({ layout: "series", voltage: 6, resistances: [10, 10, 10], closed: true }).branches[0].brightness;
    const p3 = solveCircuit({ layout: "parallel", voltage: 6, resistances: [10, 10, 10], closed: true }).branches[0].brightness;
    expect(s3).toBeLessThan(s1);
    near(p3, s1);
  });
  it("a blown bulb opens a series loop but only its own parallel branch", () => {
    const s = solveCircuit({ layout: "series", voltage: 6, resistances: [10, 10], closed: true, broken: [false, true] });
    expect(s.current).toBe(0);
    expect(s.totalResistance).toBe(Infinity);
    expect(s.branches[0].brightness).toBe(0);
    near(s.branches[1].voltage, 6); // the full battery voltage sits across the gap
    const p = solveCircuit({ layout: "parallel", voltage: 6, resistances: [10, 10], closed: true, broken: [false, true] });
    near(p.current, 0.6);
    near(p.totalResistance, 10);
    near(p.branches[0].brightness, 1);
    expect(p.branches[1].current).toBe(0);
  });
  it("open switch means no current", () => {
    expect(solveCircuit({ layout: "series", voltage: 9, resistances: [5], closed: false }).current).toBe(0);
    expect(() => solveCircuit({ layout: "series", voltage: 9, resistances: [0], closed: true })).toThrow();
  });
});

describe("waves, levers, matter", () => {
  it("v = f·λ and the wave shape", () => {
    near(waveSpeed({ amplitude: 1, frequency: 2, wavelength: 3 }), 6);
    near(waveDisplacement({ amplitude: 0.5, frequency: 1, wavelength: 4 }, 1, 0), 0.5);
    near(waveDisplacement({ amplitude: 0.5, frequency: 1, wavelength: 4 }, 1, 0.25), 0, 1e-12);
  });
  it("lever torques", () => {
    const b = solveLever({ leftMass: 2, leftDistance: 1, rightMass: 1, rightDistance: 2 });
    expect(b.balanced).toBe(true);
    const t = solveLever({ leftMass: 2, leftDistance: 1, rightMass: 1, rightDistance: 1 });
    expect(t.heavierSide).toBe("left");
    near(t.balanceRightDistance, 2);
  });
  it("phases and particle speeds", () => {
    expect(phaseAt("water", -5)).toBe("solid");
    expect(phaseAt("water", 20)).toBe("liquid");
    expect(phaseAt("water", 120)).toBe("gas");
    expect(phaseAt("chocolate", 40)).toBe("liquid");
    // Water vapour at 100 °C: about 719 m/s.
    near(rmsSpeed("water", 100), 719, 2);
  });
});

describe("safe expressions", () => {
  const f = (s: string, x: number) => compileExpression(s)(x);
  it("evaluates with correct precedence", () => {
    near(f("x^2 - 3", 2), 1);
    near(f("y = 2x + 1", 3), 7);
    near(f("-x^2", 3), -9);
    near(f("2^3^2", 0), 512);
    near(f("3(x+1)", 1), 6);
    near(f("(x+1)(x-1)", 3), 8);
    near(f("sin(pi/2)", 0), 1);
    near(f("sqrt(16) + abs(-2)", 0), 6);
    near(f("2 sin(x)", Math.PI / 2), 2);
    near(f("1/x", 4), 0.25);
    near(f("1e2 * x", 2), 200);
  });
  it("rejects anything that is not maths", () => {
    for (const bad of ["", "alert(1)", "x.constructor", "process.exit()", "x;1", "x = 3", "constructor", "2 +", "(x", "sin x", "x".repeat(101), "__proto__"]) {
      expect(isValidExpression(bad), bad).toBe(false);
    }
  });
  it("breaks lines at asymptotes", () => {
    const pts = sampleExpression(compileExpression("1/x"), -1, 1, 2);
    expect(pts[1]).toBeNull();
    expect(pts[0]).toEqual([-1, -1]);
  });
});

describe("geometry", () => {
  it("matches textbook formulas", () => {
    near(measureShape("box", [2, 3, 4]).volume!, 24);
    near(measureShape("box", [2, 3, 4]).surfaceArea!, 52);
    near(measureShape("sphere", [2, 2, 2]).volume!, (4 / 3) * Math.PI);
    near(measureShape("cylinder", [2, 5, 2]).volume!, 5 * Math.PI);
    near(measureShape("cone", [2, 3, 2]).volume!, Math.PI);
    near(measureShape("pyramid", [3, 4, 3]).volume!, 12);
    near(measureShape("prism", [2, 1, 2], 4).volume!, 2); // square of circumradius 1 has area 2
    near(measureShape("tetrahedron", [1, 1, 1]).volume!, 1 / (6 * Math.SQRT2));
    near(polygonArea([[0, 0], [4, 0], [4, 3]]), 6);
  });
});

describe("cells", () => {
  it("plants have walls and chloroplasts; animals don't", () => {
    expect(CELL_PARTS.plant).toContain("chloroplasts");
    expect(CELL_PARTS.plant).toContain("wall");
    expect(CELL_PARTS.animal).not.toContain("wall");
    expect(CELL_PARTS.bacteria).not.toContain("nucleus");
    for (const parts of Object.values(CELL_PARTS)) for (const p of parts) expect(ORGANELLES[p]).toBeDefined();
  });
});
