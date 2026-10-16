// Exact volume and surface area for the shapes the AI can build. `size` is
// the shape's bounding [width, height, depth] in metres.

export const SHAPE_KINDS = [
  "box",
  "sphere",
  "cylinder",
  "cone",
  "pyramid",
  "prism",
  "torus",
  "capsule",
  "tetrahedron",
  "octahedron",
  "dodecahedron",
  "icosahedron",
  "ring",
  "extrusion",
  "lathe",
  "tube",
  "line",
  "arrow",
  "plane",
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export interface Measures {
  volume?: number;
  surfaceArea?: number;
  /** Formula shown to students. */
  formula?: string;
}

export function measureShape(kind: ShapeKind, size: [number, number, number], sides = 6): Measures {
  const [w, h, d] = size;
  switch (kind) {
    case "box":
      return { volume: w * h * d, surfaceArea: 2 * (w * h + w * d + h * d), formula: "V = length × width × height" };
    case "sphere": {
      if (w === h && h === d) {
        const r = w / 2;
        return { volume: (4 / 3) * Math.PI * r ** 3, surfaceArea: 4 * Math.PI * r * r, formula: "V = 4/3 · π · r³" };
      }
      return { volume: (4 / 3) * Math.PI * (w / 2) * (h / 2) * (d / 2), formula: "V = 4/3 · π · a · b · c" };
    }
    case "cylinder": {
      const r = w / 2;
      return { volume: Math.PI * r * r * h, surfaceArea: 2 * Math.PI * r * (r + h), formula: "V = π · r² · h" };
    }
    case "cone": {
      const r = w / 2;
      return { volume: (Math.PI * r * r * h) / 3, surfaceArea: Math.PI * r * (r + Math.hypot(r, h)), formula: "V = 1/3 · π · r² · h" };
    }
    case "pyramid": {
      // Square base w × w.
      const slant = Math.hypot(w / 2, h);
      return { volume: (w * w * h) / 3, surfaceArea: w * w + 2 * w * slant, formula: "V = 1/3 · base area · height" };
    }
    case "prism": {
      // Regular n-gon base with circumradius w/2.
      const R = w / 2;
      const n = Math.max(3, Math.round(sides));
      const base = (n / 2) * R * R * Math.sin((2 * Math.PI) / n);
      const side = 2 * R * Math.sin(Math.PI / n);
      return { volume: base * h, surfaceArea: 2 * base + n * side * h, formula: "V = base area × height" };
    }
    case "torus": {
      // Outer width w; tube radius from the height.
      const r = h / 2;
      const R = w / 2 - r;
      return { volume: 2 * Math.PI * Math.PI * R * r * r, surfaceArea: 4 * Math.PI * Math.PI * R * r, formula: "V = 2 · π² · R · r²" };
    }
    case "capsule": {
      const r = w / 2;
      const body = Math.max(0, h - 2 * r);
      return { volume: Math.PI * r * r * body + (4 / 3) * Math.PI * r ** 3, surfaceArea: 2 * Math.PI * r * body + 4 * Math.PI * r * r };
    }
    case "tetrahedron": {
      const a = w;
      return { volume: (a ** 3) / (6 * Math.SQRT2), surfaceArea: Math.sqrt(3) * a * a, formula: "V = a³ / (6√2)" };
    }
    case "octahedron": {
      const a = w / Math.SQRT2;
      return { volume: (Math.SQRT2 / 3) * a ** 3, surfaceArea: 2 * Math.sqrt(3) * a * a };
    }
    default:
      return {};
  }
}

/** Area and perimeter of 2D shapes (for fractions, area lessons). */
export function polygonArea(points: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i], [x2, y2] = points[(i + 1) % points.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
