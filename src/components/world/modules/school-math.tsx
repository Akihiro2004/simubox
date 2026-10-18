"use client";

import { Line, RoundedBox } from "@react-three/drei";
import { useMemo } from "react";
import { Shape } from "three";
import { useSim } from "@/lib/store";
import { SCHOOL_UNITS, type MathState } from "@/lib/experiments";
import { mathNumber as f, schoolMath } from "@/lib/engine/school-math";
import { Html } from "../html";
import { Mat } from "../assets";
import { LabBoard } from "../lab-board";
import "../lab-label.css";

function Fractions({ s }: { s: MathState }) {
  const scale = 3.8 / Math.max(1, Math.abs(s.numerator / s.denominator), Math.abs(s.numerator2 / s.denominator2));
  return <group position={[0, 1.06, .7]}>
    {[[s.numerator, s.denominator], [s.numerator2, s.denominator2]].map(([n, d], row) => <group key={row} position={[0, 0, row * 1.25 - .4]}>
      <Line points={[[-4.2, 0, 0], [4.2, 0, 0]]} color="#a6b6b0" lineWidth={1} />
      {Array.from({ length: Math.max(d, Math.abs(n)) }, (_, i) => <mesh key={i} position={[(n < 0 ? -1 : 1) * (i + .5) * scale / d, .06, 0]} castShadow><boxGeometry args={[scale / d * .94, .12, .42]} /><Mat c={i >= Math.abs(n) ? "#eee8d6" : row ? "#d7ab59" : "#5a9795"} /></mesh>)}
      <Html position={[-4.3, .3, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label text-[12px]">{n}/{d}</span></Html>
      <mesh position={[0, .02, 0]}><boxGeometry args={[.025, .1, .6]} /><Mat c="#334e53" /></mesh>
    </group>)}
    <Html position={[0, -.6, 2.6]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label">Equal parts make one whole. Colored tiles show each fraction; negatives extend left.</span></Html>
  </group>;
}

function Geometry({ s }: { s: MathState }) {
  const scale = 2.2 / Math.max(s.width, s.height, s.depth);
  const triangle = useMemo(() => new Shape().moveTo(0, 0).lineTo(s.width, 0).lineTo(0, s.height).closePath(), [s.width, s.height]);
  const flat = ["rectangle", "triangle", "circle"].includes(s.shape);
  return <group position={[0, 1.06, .7]}>
    <group scale={scale} position={[s.shape === "triangle" ? -s.width * scale / 2 : 0, .1, 0]}>
      <mesh castShadow position={[0, flat ? 0 : s.shape === "sphere" ? s.width / 2 : s.height / 2, 0]} rotation={flat ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
        {s.shape === "rectangle" ? <planeGeometry args={[s.width, s.height]} /> : s.shape === "triangle" ? <shapeGeometry args={[triangle]} /> : s.shape === "circle" ? <circleGeometry args={[s.width / 2, 64]} /> : s.shape === "cuboid" ? <boxGeometry args={[s.width, s.height, s.depth]} /> : s.shape === "cylinder" ? <cylinderGeometry args={[s.width / 2, s.width / 2, s.height, 48]} /> : <sphereGeometry args={[s.width / 2, 32, 24]} />}
        <Mat c="#65a69d" />
      </mesh>
    </group>
    <Html position={[0, -.45, 1.7]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label">{s.shape} · {s.shape === "sphere" || s.shape === "circle" || s.shape === "cylinder" ? "diameter" : "width"} {f(s.width)}{s.shape !== "sphere" && s.shape !== "circle" ? ` · height ${f(s.height)}` : ""}{s.shape === "cuboid" ? ` · depth ${f(s.depth)}` : ""}</span></Html>
  </group>;
}

function Points({ s }: { s: MathState }) {
  const r = schoolMath(s), points = r.points;
  const extent = Math.max(1, ...points.flat().map(Math.abs));
  const unit = 2.1 / extent;
  const p = ([x, y]: [number, number]): [number, number, number] => [x * unit, .025, -y * unit];
  return <group position={[0, 1.06, .6]}>
    <Line points={[[-3, 0, 0], [3, 0, 0]]} color="#637b79" lineWidth={2} />
    {s.mode !== "number_line" && s.mode !== "inequality" && s.mode !== "equation" && <Line points={[[0, 0, -2.2], [0, 0, 2.2]]} color="#637b79" lineWidth={2} />}
    {s.mode === "trigonometry" && <Line points={Array.from({ length: 97 }, (_, i) => p([Math.cos(i * Math.PI / 48), Math.sin(i * Math.PI / 48)]))} color="#c1a063" lineWidth={2} />}
    {points.length > 1 && <Line points={points.map(p)} color="#d09b4a" lineWidth={3} />}
    {points.map((point, i) => <group key={i} position={p(point)}><mesh><sphereGeometry args={[.08, 16, 12]} /><Mat c={i ? "#cf8c57" : "#387d86"} /></mesh><Html position={[0, .25, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label whitespace-nowrap text-[10px]">({f(point[0])}, {f(point[1])})</span></Html></group>)}
    <Html position={[0, -.65, 2.8]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label">Shared x–y scale · x increases right · y increases away</span></Html>
  </group>;
}

function Measurement({ s }: { s: MathState }) {
  const converted = s.a * SCHOOL_UNITS[s.unitFrom][1] / SCHOOL_UNITS[s.unitTo][1];
  return <group position={[0, 1.14, .7]}>{[[s.a, s.unitFrom], [converted, s.unitTo]].map(([value, unit], row) => <group key={row} position={[0, 0, row * .8]}>
    <mesh castShadow><boxGeometry args={[5.5, .12, .48]} /><Mat c={row ? "#c9ab69" : "#649b95"} /></mesh>
    {Array.from({ length: 11 }, (_, i) => <mesh key={i} position={[(i - 5) * .5, .075, 0]}><boxGeometry args={[.02, .02, i % 5 ? .15 : .32]} /><Mat c="#f1e9d8" /></mesh>)}
    <Html position={[0, .4, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label">{f(Number(value))} {unit}</span></Html>
  </group>)}<Html position={[0, -.2, 1.8]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label text-[11px]">Same physical quantity · different units</span></Html></group>;
}

function MathDesk({ s }: { s: MathState }) {
  const r = useMemo(() => schoolMath(s), [s]);
  const values = r.values.slice(0, 16), largest = Math.max(1, ...values.map(x => Math.abs(x.value)));
  const pointsMode = ["angles", "number_line", "trigonometry", "transform", "equation", "inequality", "quadratic", "linear_system"].includes(s.mode);
  return <>
    <group position={[-5.78, 0, -.8]} rotation={[0, Math.PI / 2, 0]}>
    <RoundedBox args={[7.1, 2.55, .16]} radius={.06} position={[0, 2.65, 0]} castShadow><Mat c="#c6ac87" /></RoundedBox>
    <LabBoard position={[0, 2.65, .11]} width={6.88} height={2.34} background="#435572" lines={[
      { text: r.title, size: 56, color: "#a9d3c7" }, { text: r.formula, size: 80 }, { text: r.answer, size: 96, color: "#ffe3a1" },
      ...r.steps.map((text, i) => ({ text: `${i + 1}. ${text}`, size: 46 })),
    ]} />
    </group>
    {s.mode === "measurement" ? <Measurement s={s} /> : s.mode === "fractions" ? <Fractions s={s} /> : s.mode === "geometry" ? <Geometry s={s} /> : pointsMode ? <Points s={s} /> : <group position={[0, 1.75, 1]}>
      <Line points={[[-3.7, 0, 0], [3.7, 0, 0]]} color="#7a8d82" lineWidth={2} />
      {values.map((item, i) => {
        const height = Math.abs(item.value) / largest * .65;
        return <group key={i} position={[(i - (values.length - 1) / 2) * Math.min(.9, 6.5 / Math.max(1, values.length)), 0, 0]}>
          <mesh position={[0, Math.sign(item.value) * height / 2, 0]} castShadow><boxGeometry args={[Math.min(.55, 5 / Math.max(1, values.length)), Math.max(.012, height), .45]} /><Mat c={item.value < 0 ? "#cf9875" : i % 2 ? "#c8ad64" : "#609b98"} /></mesh>
          <Html position={[0, .9, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><div className="text-center"><span className="text-[11px] font-extrabold">{f(item.value)}</span><p className="max-w-[72px] text-[10px] text-ink-3">{item.label}</p></div></Html>
        </group>;
      })}
      <Html position={[0, -.6, 1.2]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label whitespace-nowrap text-[11px]">Bars share one linear scale{r.values.length > 16 ? " · first 16 shown; calculations use ALL values" : " · zero at the baseline"}</span></Html>
    </group>}
  </>;
}

export function SchoolMathModule() {
  const s = useSim(state => state.world === "math_studio" ? state.modules.maths : null);
  const graph = useSim(state => !!state.modules.plot && (state.modules.plot.functions.length + state.modules.plot.points.length + state.modules.plot.vectors.length) > 0);
  return s && !graph && s.mode !== "functions" ? <MathDesk s={s} /> : null;
}
