"use client";

import { Component, lazy, Suspense, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { useSim } from "@/lib/store";
import { Html } from "./html";
import { CompoundLoading } from "./chem";

// Keep these imports behind the active experiment. In particular, the Earth
// atlas and wave-field renderers should never be downloaded for a bedroom visit.
const Space = lazy(() => import("./modules/space").then(m => ({ default: m.SpaceModule })));
const Globe = lazy(() => import("./modules/globe").then(m => ({ default: m.GlobeModule })));
const Plot = lazy(() => import("./modules/math").then(m => ({ default: m.MathModule })));
const Workshop = lazy(() => import("./modules/workshop").then(m => ({ default: m.WorkshopModules })));
const Particles = lazy(() => import("./modules/lab").then(m => ({ default: m.ParticlesModule })));
const Cell = lazy(() => import("./modules/cell").then(m => ({ default: m.CellModule })));
const Reaction = lazy(() => import("./modules/reaction").then(m => ({ default: m.ReactionModule })));
const Population = lazy(() => import("./modules/population").then(m => ({ default: m.PopulationModule })));
const Genetics = lazy(() => import("./modules/genetics").then(m => ({ default: m.GeneticsModule })));
const Osmosis = lazy(() => import("./modules/osmosis").then(m => ({ default: m.OsmosisModule })));
const Signal = lazy(() => import("./modules/signal").then(m => ({ default: m.SignalModule })));
const Optics = lazy(() => import("./modules/optics").then(m => ({ default: m.OpticsModule })));
const Mechanics = lazy(() => import("./modules/mechanics").then(m => ({ default: m.MechanicsModule })));
const Anatomy = lazy(() => import("./modules/anatomy").then(m => ({ default: m.AnatomyModule })));
const SchoolMath = lazy(() => import("./modules/school-math").then(m => ({ default: m.SchoolMathModule })));

class ExperimentBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Html position={[0, 2, 0]} center>
      <div role="alert" className="glass w-[min(280px,calc(100vw-32px))] rounded-2xl p-4 text-center text-sm">
        <p>This experiment couldn’t load. Check your connection and reload to try again.</p>
        <button className="btn mt-2 rounded-full px-4 py-2 font-bold" onClick={() => location.reload()}>Reload</button>
      </div>
    </Html>;
    return this.props.children;
  }
}

export function ScienceModules({ animate }: { animate: boolean }) {
  const active = useSim(useShallow(s => ({
    space: !!s.modules.orbits,
    globe: !!s.modules.globe,
    plot: !!s.modules.plot,
    workshop: !!(s.modules.circuit || s.modules.wave || s.modules.lever || s.modules.ripple || s.modules.magnet),
    particles: !!s.modules.particles,
    cell: !!s.modules.cell,
    reaction: !!s.modules.reaction,
    population: !!s.modules.population,
    genetics: !!s.modules.genetics,
    osmosis: !!s.modules.osmosis,
    signal: !!s.modules.signal,
    optics: !!s.modules.optics,
    mechanics: s.world === "mechanics" && !!s.modules.mechanics,
    anatomy: s.world === "anatomy" && !!s.modules.anatomy,
    maths: s.world === "math_studio" && !!s.modules.maths && s.modules.maths.mode !== "functions"
      && !(s.modules.plot && (s.modules.plot.functions.length || s.modules.plot.points.length || s.modules.plot.vectors.length)),
  })));
  return <ExperimentBoundary><CompoundLoading /><Suspense fallback={<Html position={[0, 2, 0]} center><div role="status" className="tag whitespace-nowrap">Preparing experiment…</div></Html>}>
    {active.space && <Space />}
    {active.globe && <Globe animate={animate} />}
    {active.plot && <Plot />}
    {active.workshop && <Workshop animate={animate} />}
    {active.particles && <Particles animate={animate} />}
    {active.cell && <Cell />}
    {active.reaction && <Reaction animate={animate} />}
    {active.population && <Population animate={animate} />}
    {active.genetics && <Genetics />}
    {active.osmosis && <Osmosis animate={animate} />}
    {active.signal && <Signal animate={animate} />}
    {active.optics && <Optics />}
    {active.mechanics && <Mechanics animate={animate} />}
    {active.anatomy && <Anatomy animate={animate} />}
    {active.maths && <SchoolMath />}
  </Suspense></ExperimentBoundary>;
}
