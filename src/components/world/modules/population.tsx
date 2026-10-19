"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, type Mesh } from "three";
import { Html } from "@/components/world/html";
import { useSim } from "@/lib/store";
import { cyclePeriod, seriesAt, solvePopulation, type Series } from "@/lib/engine/ecology";

// A graph board standing on the lab pedestal (top at y ≈ 0.8).
const W = 2.8, H = 1.6, Y = 0.8 + 0.15 + H / 2;
const PX = 1400, PY = 800, PAD = { l: 110, r: 40, t: 50, b: 90 };
const COLORS = { prey: "#16a34a", predators: "#dc2626", N: "#2563eb" };
/** Seconds the cursor takes to sweep the whole graph. */
const SWEEP = 20;

function drawGraph(s: Series, labels: string[], colors: string[], K: number | null, years: number): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = PX; c.height = PY;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6"; g.fillRect(0, 0, PX, PY);
  const top = Math.max(...s.y.map((y) => Math.max(...y)), K ?? 0) * 1.12 || 1;
  const x = (t: number) => PAD.l + (t / years) * (PX - PAD.l - PAD.r);
  const y = (v: number) => PY - PAD.b - (v / top) * (PY - PAD.t - PAD.b);
  // Grid and axes.
  g.strokeStyle = "#e2e0d8"; g.lineWidth = 2; g.font = "600 28px system-ui, sans-serif"; g.fillStyle = "#6b7280";
  const step = Math.pow(10, Math.floor(Math.log10(top))) * (top / Math.pow(10, Math.floor(Math.log10(top))) > 5 ? 2 : 1);
  for (let v = 0; v <= top; v += step) { g.beginPath(); g.moveTo(PAD.l, y(v)); g.lineTo(PX - PAD.r, y(v)); g.stroke(); g.fillText(String(Math.round(v)), 18, y(v) + 10); }
  const ystep = years > 60 ? 20 : years > 25 ? 10 : 5;
  for (let t = 0; t <= years; t += ystep) { g.fillText(String(t), x(t) - 12, PY - PAD.b + 40); }
  g.fillText("years", PX - PAD.r - 80, PY - 20);
  if (K !== null) { g.setLineDash([14, 10]); g.strokeStyle = "#94a3b8"; g.beginPath(); g.moveTo(PAD.l, y(K)); g.lineTo(PX - PAD.r, y(K)); g.stroke(); g.setLineDash([]); g.fillText("carrying capacity K", PAD.l + 12, y(K) - 12); }
  s.y.forEach((series, k) => {
    g.strokeStyle = colors[k]; g.lineWidth = 6; g.beginPath();
    series.forEach((v, i) => (i ? g.lineTo(x(s.t[i]), y(v)) : g.moveTo(x(s.t[i]), y(v))));
    g.stroke();
    g.fillStyle = colors[k]; g.font = "700 32px system-ui, sans-serif"; g.fillText(labels[k], PAD.l + 20 + k * 260, PAD.t - 10);
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function PopulationModule({ animate }: { animate: boolean }) {
  const p = useSim((s) => s.modules.population);
  const series = useMemo(() => (p ? solvePopulation(p) : null), [p]);
  const logistic = p?.model === "logistic";
  const labels = logistic ? ["Population N"] : ["Prey (thousands)", "Predators (thousands)"];
  const colors = logistic ? [COLORS.N] : [COLORS.prey, COLORS.predators];
  const tex = useMemo(() => (p && series ? drawGraph(series, labels, colors, logistic ? p.K : null, p.years) : null), [series]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex?.dispose(), [tex]);
  const cursor = useRef<Mesh>(null);
  const [now, setNow] = useState(0);
  const last = useRef(0);
  const clock0 = useRef<number | null>(null);
  useEffect(() => { clock0.current = null; }, [p]);

  useFrame(({ clock }) => {
    if (!p || !cursor.current) return;
    clock0.current ??= clock.elapsedTime;
    const u = animate ? ((clock.elapsedTime - clock0.current) / SWEEP) % 1 : 1;
    cursor.current.position.x = -W / 2 + (PAD.l / PX) * W + u * ((PX - PAD.l - PAD.r) / PX) * W;
    if (clock.elapsedTime - last.current > 0.25) { last.current = clock.elapsedTime; setNow(u * p.years); }
  });

  if (!p || !series || !tex) return null;
  const plotH = ((PY - PAD.t - PAD.b) / PY) * H;
  return (
    <group position={[0, Y, 0]}>
      <mesh>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      <mesh position={[0, -H / 2 - 0.05, -0.02]}>
        <boxGeometry args={[W + 0.08, 0.1, 0.12]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh ref={cursor} position={[0, H / 2 - (PAD.t / PY) * H - plotH / 2, 0.01]}>
        <planeGeometry args={[0.012, plotH]} />
        <meshBasicMaterial color="#1c1e22" transparent opacity={0.5} />
      </mesh>
      <Html position={[0, -H / 2 - 0.4, 0.2]} center zIndexRange={[15, 0]} style={{ pointerEvents: "none" }}>
        <div className="tag flex max-w-[330px] flex-col items-center px-3.5 py-1.5 text-center leading-tight !whitespace-normal" role="status">
          <span className="text-[14px] font-extrabold">
            Year {now.toFixed(0)}: {logistic ? `${Math.round(seriesAt(series, 0, now))} individuals` : `${seriesAt(series, 0, now).toFixed(1)}k prey, ${seriesAt(series, 1, now).toFixed(1)}k predators`}
          </span>
          <span className="text-[12px] font-semibold text-ink-3">
            {logistic
              ? `Logistic growth: fast at first, then slowing as it nears K = ${p.K}.`
              : `Predator–prey cycle about every ${cyclePeriod(p).toFixed(1)} years; predators peak after prey.`}
          </span>
          <span className="text-[11px] font-semibold text-ink-3">{logistic ? "dN/dt = rN(1 − N/K)" : "Lotka–Volterra model"}, solved step by step (Runge–Kutta)</span>
        </div>
      </Html>
    </group>
  );
}
