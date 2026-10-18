"use client";

import { Line, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { Group } from "three";
import { useSim } from "@/lib/store";
import { mechanicsAt, MECHANICS_LABELS } from "@/lib/engine/mechanics";
import type { MechanicsState } from "@/lib/experiments";
import { Html } from "../html";
import { Mat } from "../assets";
import "../lab-label.css";

function Cart({ color, mass }: { color: string; mass: number }) {
  return <group>
    <RoundedBox args={[.82, .27, .58]} radius={.055} position={[0, .3, 0]} castShadow><Mat c={color} m={.15} /></RoundedBox>
    <RoundedBox args={[.7, .06, .5]} radius={.02} position={[0, .47, 0]} castShadow><Mat c="#e9e1ca" /></RoundedBox>
    <mesh position={[0, .56, 0]} castShadow><cylinderGeometry args={[.16, .2, .14, 20]} /><Mat c="#577174" m={.5} /></mesh>
    {[-.27, .27].flatMap(x => [-.31, .31].map(z => <group key={`${x}${z}`} position={[x, .13, z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh castShadow><cylinderGeometry args={[.13, .13, .09, 20]} /><Mat c="#34454b" /></mesh>
      <mesh><cylinderGeometry args={[.055, .055, .1, 12]} /><Mat c="#bdc7c4" m={.6} /></mesh>
    </group>))}
    <Html position={[0, .86, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label">{mass} kg</span></Html>
  </group>;
}

function Bench({ s, animate }: { s: MechanicsState; animate: boolean }) {
  const cart = useRef<Group>(null), second = useRef<Group>(null), pendulum = useRef<Group>(null), spring = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null), force = useRef<Group>(null);
  const time = useRef(0), lastLabel = useRef(-1);
  const drawnTime = useRef(NaN);
  const ramp = s.mode === "ramp", isPendulum = s.mode === "pendulum";
  const angle = ramp ? s.angleDeg * Math.PI / 180 : 0;
  const span = ramp ? Math.min(5.4, 2.35 / Math.max(.01, Math.sin(angle))) : 9.2;
  const trackY = ramp ? 1.2 + (span / 2 + .45) * Math.sin(angle) : 1.2;
  const fit = useMemo(() => {
    const positions = Array.from({ length: 161 }, (_, i) => mechanicsAt(s, i / 160 * s.durationS)).flatMap(r => s.mode === "collision" ? [r.x, r.x2] : [r.x]);
    const min = Math.min(-.5, ...positions), max = Math.max(.5, ...positions);
    const scale = Math.min(1, (span - (s.mode === "collision" ? 1.9 : .95)) / (max - min));
    return { scale, offset: -(min + max) / 2 * scale };
  }, [s, span]);
  const coil = useMemo(() => Array.from({ length: 81 }, (_, i) => [i / 80, .25 + (i === 0 || i === 80 ? 0 : Math.sin(i * Math.PI / 4) * .1), 0] as [number, number, number]), []);
  useEffect(() => { time.current = animate && s.playing ? 0 : s.durationS; lastLabel.current = -1; drawnTime.current = NaN; }, [s, animate]);
  useFrame((_, dt) => {
    const state = useSim.getState();
    if (animate && s.playing && !state.paused) time.current = Math.min(s.durationS, time.current + Math.min(dt, .05) * state.timeScale);
    const t = time.current;
    // Html commits its DOM root after the scene's first frame. Populate a
    // newly mounted readout even when the experiment is already held still.
    if (drawnTime.current === t && (!label.current || label.current.textContent)) return;
    drawnTime.current = t;
    const r = mechanicsAt(s, t);
    if (cart.current) cart.current.position.x = r.x * fit.scale + fit.offset - (s.mode === "collision" ? .43 : 0);
    if (second.current) second.current.position.x = r.x2 * fit.scale + fit.offset + .43;
    if (pendulum.current) pendulum.current.rotation.z = r.angle;
    if (spring.current) spring.current.scale.x = Math.max(.1, r.x * fit.scale + fit.offset + 5.1);
    if (force.current) {
      force.current.position.x = r.x * fit.scale + fit.offset;
      force.current.rotation.y = r.netForce < 0 ? Math.PI : 0;
      force.current.scale.x = Math.max(.01, Math.min(2, Math.abs(r.netForce) / 8));
      force.current.visible = Math.abs(r.netForce) > .001 && s.mode !== "collision";
    }
    if (label.current && (Math.floor(t * 10) !== lastLabel.current || !label.current.textContent)) {
      lastLabel.current = Math.floor(t * 10);
      label.current.textContent = `t ${t.toFixed(1)} s  ·  v ${r.velocity.toFixed(2)} m/s  ·  a ${r.acceleration.toFixed(2)} m/s²  ·  p ${r.momentum.toFixed(2)} kg·m/s`;
    }
  });
  return <>
    <Html position={[0, .72, 1.85]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><div className="tag lab-label lab-readout"><p className="font-extrabold">{MECHANICS_LABELS[s.mode]}</p><div ref={label} className="lab-readout-values tabular-nums" /></div></Html>
    {isPendulum ? <group position={[0, 3.7, .2]}>
      <mesh castShadow position={[0, .12, 0]}><boxGeometry args={[3.4, .2, .25]} /><Mat c="#b58f61" /></mesh>
      {[-1.7, 1.7].map(x => <mesh key={x} position={[x, -1.8, 0]} castShadow><boxGeometry args={[.15, 3.8, .2]} /><Mat c="#69828a" /></mesh>)}
      <group ref={pendulum}><Line points={[[0, 0, 0], [0, -s.lengthM, 0]]} color="#4a555e" lineWidth={2} /><mesh position={[0, -s.lengthM, 0]} castShadow><sphereGeometry args={[.18 + Math.cbrt(s.massKg) * .035, 24, 16]} /><Mat c="#d1a45a" m={.4} /></mesh></group>
      {[-1.7, 1.7].map(x => <RoundedBox key={x} args={[.75, .12, 1.3]} radius={.035} position={[x, -3.64, 0]} castShadow><Mat c="#69828a" m={.3} /></RoundedBox>)}
    </group> : <group position={[0, trackY, .3]} rotation={[0, 0, -angle]}>
      <RoundedBox args={[span + 1, .18, 1.3]} radius={.06} position={[0, -.12, 0]} castShadow receiveShadow><Mat c="#668b8d" m={.15} /></RoundedBox>
      {[-.34, .34].map(z => <mesh key={z} position={[0, -.005, z]}><boxGeometry args={[span + .9, .035, .04]} /><Mat c="#d5dfe0" m={.6} /></mesh>)}
      {Array.from({ length: 21 }, (_, i) => <group key={i} position={[(i - 10) * span / 20, .01, .58]}>
        <mesh><boxGeometry args={[.018, .015, .14]} /><Mat c="#e9e5ca" /></mesh>
        {i % 4 === 0 && <Html position={[0, -.03, .3]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="lab-ruler-mark whitespace-nowrap text-[10px] font-bold text-ink-2" data-endpoint={i === 0 || i === 20}>{(((i - 10) * span / 20 - fit.offset) / fit.scale).toFixed(1)} m</span></Html>}
      </group>)}
      <group ref={cart}><Cart color="#d8a752" mass={s.massKg} /></group>
      {s.mode === "collision" && <group ref={second}><Cart color="#5b9aab" mass={s.mass2Kg} /></group>}
      {s.mode === "spring" && <><mesh position={[-5.2, .25, 0]}><boxGeometry args={[.15, .65, .7]} /><Mat c="#b79b76" /></mesh><group position={[-5.1, 0, 0]} ref={spring}><Line points={coil} color="#4c6b78" lineWidth={3} /></group></>}
      <group ref={force} position={[0, .88, 0]}><Line points={[[0, 0, 0], [1, 0, 0]]} color="#d56e4b" lineWidth={4} /><mesh position={[1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}><coneGeometry args={[.09, .22, 12]} /><meshBasicMaterial color="#d56e4b" /></mesh></group>
    </group>}
    {!isPendulum && !ramp && <>
      <RoundedBox args={[10.6, .18, 1.9]} radius={.06} position={[0, .96, .3]} castShadow receiveShadow><Mat c="#bda17b" /></RoundedBox>
      {[-3.7, 3.7].map(x => <group key={x} position={[x, 0, .3]}>
        <RoundedBox args={[1.3, .85, 1.5]} radius={.05} position={[0, .47, 0]} castShadow><Mat c="#698a83" /></RoundedBox>
        {[.29, .64].map(y => <group key={y}><RoundedBox args={[1.15, .3, .06]} radius={.02} position={[0, y, .78]}><Mat c="#e8dfcb" /></RoundedBox><mesh position={[0, y, .83]}><boxGeometry args={[.28, .035, .05]} /><Mat c="#4c6767" m={.3} /></mesh></group>)}
      </group>)}
    </>}
    {ramp && [-.42, .42].map(k => {
      const x = k * span, h = trackY - x * Math.sin(angle) - .18;
      return <group key={k} position={[x * Math.cos(angle), 0, .3]}><RoundedBox args={[.25, h, 1.05]} radius={.035} position={[0, h / 2, 0]} castShadow><Mat c="#72918d" m={.2} /></RoundedBox><RoundedBox args={[.9, .12, 1.5]} radius={.04} position={[0, .06, 0]}><Mat c="#bfa477" /></RoundedBox></group>;
    })}
    <Html position={[0, .15, 3.6]} center zIndexRange={[8, 0]} style={{ pointerEvents: "none" }}><span className="tag lab-label lab-caption">{isPendulum ? "Angles limited to 15° · ideal small-angle model" : "Scaled track · measurements in SI units · orange arrow = net force"}</span></Html>
  </>;
}

export function MechanicsModule({ animate }: { animate: boolean }) {
  const s = useSim(state => state.world === "mechanics" ? state.modules.mechanics : null);
  return s ? <Bench s={s} animate={animate} /> : null;
}
