// Shared by the landing page and its 3D stage, mutated outside React every
// frame: native scroll progress, the chapter on screen, and the
// leader line that ties the visible card to its demo.
export const landingView: {
  p: number;
  /** The chapter on screen; its card is `.landing-card`. */
  chapter: string;
  leader: SVGPathElement | null;
  dot: SVGCircleElement | null;
} = { p: 0, chapter: "hero", leader: null, dot: null };
