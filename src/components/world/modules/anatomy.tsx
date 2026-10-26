"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { use, useEffect, useMemo, useRef } from "react";
import { BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3, TubeGeometry, Color, MeshStandardMaterial, Raycaster, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, type Group, type Mesh } from "three";
import body from "@/lib/world/anatomy.generated.json";
import { anatomyLooks, STRUCTURES, type Look, type StructureId } from "@/lib/world/anatomy";
import { DEFAULT_ANATOMY, type AnatomyState } from "@/lib/experiments";
import { anatomyBreath, anatomyGas, anatomyHeart } from "@/lib/anatomy-values";
import { actionPotential, kidneyBalance, diaphragmTravelCm, digestionAt, DIGESTION_STAGES, FIBERS, LUNG_VOLUMES, pulseWaveVelocity, reflexLatencyMs } from "@/lib/engine/physiology";
import { noteFocus, useSim } from "@/lib/store";
import type { Vec3 } from "@/lib/world/catalog";
import { Html } from "../html";

// The life-size body on the Anatomy Lab dais. Meshes: BodyParts3D (DBCLS),
// prebuilt by scripts/build-anatomy.mjs into one static file. Every motion is
// driven by the physiology models in src/lib/engine/physiology.ts.

type Meta = { name: string; system: string; color: string; group?: boolean; vertexOffset: number; vertexCount: number; indexOffset: number; indexCount: number; center: number[]; min: number[]; max: number[] };
const META = body.structures as Record<string, Meta>;
/** The dais top: the meshes have their feet at y = 0. */
const FLOOR = 0.25;
/** Heart and nerve motion that would be too small or too fast to see. */
const HEART_EXAGGERATION = 2.5, NERVE_SLOWDOWN = 200, DIGEST_HOURS_PER_S = 1;

// Modesty: the genital region is always obscured, in every view (a children's app).
// Found from the skin mesh itself: front of the body, below the pubic bone.
const groin = { min: new Vector3(-.08, .7, 0), max: new Vector3(.08, .9, .16) };
function findGroin(p: Float32Array) {
  const pubis = META.pelvis?.min[1] ?? .83, min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
  // Smooth the skin there into a plain mannequin surface: anything in front of
  // the skin over the pubic bone is pressed back onto it.
  const cap = (META.pelvis?.max[2] ?? .04) + .03;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], z = p[i + 2];
    if (Math.abs(x) < .075 && y > pubis - .16 && y < pubis + .05 && z > .01) {
      const edge = Math.min(1, (.075 - Math.abs(x)) / .02, (y - (pubis - .16)) / .03, (pubis + .05 - y) / .03);
      if (z > cap) p[i + 2] = z - (z - cap) * .9 * edge;
      min.min(new Vector3(x, y, p[i + 2])); max.max(new Vector3(x, y, p[i + 2]));
    }
  }
  if (min.x < max.x) {
    groin.min.copy(min).addScalar(-.012);
    groin.max.copy(max).addScalar(.012);
  }
}
const GROIN_GLSL = "uniform vec3 uGroinMin; uniform vec3 uGroinMax; varying vec3 vLocal;\nfloat groinWeight(){ vec3 c = (uGroinMin + uGroinMax) * 0.5, h = (uGroinMax - uGroinMin) * 0.5; vec3 q = abs(vLocal - c) / h; return 1.0 - smoothstep(0.75, 1.0, max(q.x, max(q.y, q.z))); }";
const groinUniforms = { uGroinMin: { value: groin.min }, uGroinMax: { value: groin.max } };

/** Bones measured separately on each side of the body (mesh x: the person's left is +x). */
const SIDED = ["femur", "leg_bones", "foot_bones", "arm_bones", "hand_bones", "shoulder_bones"];
type Box = { min: number[]; max: number[] };
const sideBoxes: Record<string, Partial<Record<-1 | 1, Box>>> = {};
/** The person's right side in mesh x (their heart is on their left). */
const RIGHT = (META.heart?.center[0] ?? .02) > 0 ? -1 : 1;

let loading: Promise<Record<string, BufferGeometry>> | null = null;
function loadBody(): Promise<Record<string, BufferGeometry>> {
  loading ??= fetch("/anatomy/body.bin").then(r => { if (!r.ok) throw new Error(`body.bin ${r.status}`); return r.arrayBuffer(); }).then(buf => {
    const pos = new Int16Array(buf, 0, body.positionCount), ind = new Uint16Array(buf, body.indexByteOffset, body.indexCount);
    const out: Record<string, BufferGeometry> = {};
    const heart = META.heart?.center ?? [0, 1.3, 0];
    for (const [id, m] of Object.entries(META)) {
      const p = new Float32Array(m.vertexCount * 3);
      for (let i = 0; i < p.length; i++) { const a = i % 3; p[i] = (pos[m.vertexOffset * 3 + i] / 32767) * body.half[a] + body.center[a]; }
      const g = new BufferGeometry();
      if (id === "skin") findGroin(p);
      g.setAttribute("position", new BufferAttribute(p, 3));
      g.setIndex(new BufferAttribute(ind.slice(m.indexOffset, m.indexOffset + m.indexCount), 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      if (id === "arteries" || id === "aorta") {
        // Straight-line distance from the heart, standing in for the path the pulse travels.
        const d = new Float32Array(m.vertexCount);
        for (let v = 0; v < m.vertexCount; v++) d[v] = Math.hypot(p[v * 3] - heart[0], p[v * 3 + 1] - heart[1], p[v * 3 + 2] - heart[2]);
        g.setAttribute("aDist", new BufferAttribute(d, 1));
      }
      if (SIDED.includes(id)) for (const side of [-1, 1] as const) {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < p.length; i += 3) if (p[i] * side > 0) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
        (sideBoxes[id] ??= {})[side] = { min: lo, max: hi };
      }
      out[id] = g;
    }
    return out;
  });
  return loading;
}

/** A see-through x-ray look: bright at the silhouette, clear in the middle. */
function ghostMaterial(color: string, strength: number) {
  return new ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new Color(color) }, uStrength: { value: strength }, ...groinUniforms },
    vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vLocal; void main(){ vLocal = position; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying vec3 vN; varying vec3 vV; ${GROIN_GLSL}
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); gl_FragColor = vec4(uColor, (0.03 + f * 0.55) * uStrength * (1.0 - groinWeight())); }`,
  });
}

/** Standard material; arteries also get the travelling pulse-wave glow. */
function solidMaterial(id: string, m: Meta, pulse: { front: { value: number } } | null) {
  const lung = id === "lung_left" || id === "lung_right";
  const mat = new MeshStandardMaterial({ color: m.color, roughness: id === "skin" ? .62 : .5, metalness: 0, ...(lung ? { transparent: true, opacity: .5, depthWrite: false } : {}) });
  if (id === "skin") mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, groinUniforms);
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${GROIN_GLSL}`).replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = normalize(mix(normal, vec3(0.0, 0.0, 1.0), groinWeight()));");
  };
  if (pulse) mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFront = pulse.front;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute float aDist;\nvarying float vDist;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvDist = aDist;");
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFront;\nvarying float vDist;").replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nfloat band = exp(-pow((vDist - uFront) / 0.07, 2.0));\ntotalEmissiveRadiance += vec3(1.0, 0.25, 0.2) * band * 0.9;");
  };
  return mat;
}

// One body exists at a time, so its GPU materials live for the whole visit and
// the frame loop can update them in place (outside React state).
const pulse = { front: { value: -1 } };
let mats: { solid: Record<string, MeshStandardMaterial>; ghost: Record<string, ShaderMaterial> } | null = null;
function materials() {
  if (mats) return mats;
  const solid: Record<string, MeshStandardMaterial> = {}, ghost: Record<string, ShaderMaterial> = {};
  for (const [id, m] of Object.entries(META)) {
    solid[id] = solidMaterial(id, m, id === "arteries" || id === "aorta" ? pulse : null);
    ghost[id] = ghostMaterial(id === "skin" ? "#9fd4ea" : "#d6e6ee", id === "skin" ? 1 : .55);
  }
  return (mats = { solid, ghost });
}

/**
 * X-ray films for the light box, projected from the real bone meshes: every
 * triangle adds a little brightness, so thicker bone shows whiter, as on a
 * radiograph.
 */
export async function xrayTextures(): Promise<CanvasTexture[]> {
  const geos = await loadBody();
  const film = (ids: string[], box: { x: [number, number]; y: [number, number] }, exposure: number, side?: -1 | 1) => {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#08111a"; g.fillRect(0, 0, 256, 320);
    const w = box.x[1] - box.x[0], h = box.y[1] - box.y[0], s = Math.min(240 / w, 300 / h);
    const ox = 128 - ((box.x[0] + box.x[1]) / 2) * s, oy = 160 + ((box.y[0] + box.y[1]) / 2) * s;
    g.globalCompositeOperation = "lighter";
    // A bone shows its front and back surfaces, so two layers should read as mid-grey.
    g.fillStyle = `rgba(205, 220, 238, ${exposure})`;
    for (const id of ids) {
      const geo = geos[id];
      if (!geo) continue;
      const p = geo.attributes.position.array as Float32Array, idx = geo.index!.array;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
        if (side && p[a] * side < 0) continue;
        g.beginPath();
        g.moveTo(ox + p[a] * s, oy - p[a + 1] * s); g.lineTo(ox + p[b] * s, oy - p[b + 1] * s); g.lineTo(ox + p[d] * s, oy - p[d + 1] * s);
        g.fill();
      }
    }
    g.globalCompositeOperation = "source-over";
    const v = g.createRadialGradient(128, 160, 90, 128, 160, 220);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v; g.fillRect(0, 0, 256, 320);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  };
  const box = (id: string, pad: number, side?: -1 | 1) => {
    const b = side ? sideBoxes[id]?.[side] : META[id];
    return b ? { x: [b.min[0] - pad, b.max[0] + pad] as [number, number], y: [b.min[1] - pad, b.max[1] + pad] as [number, number] } : { x: [-.2, .2] as [number, number], y: [1, 1.6] as [number, number] };
  };
  const chest = box("ribcage", .04);
  return [
    film(["skull", "spine"], box("skull", .02), .09),
    film(["ribcage", "spine", "shoulder_bones", "arm_bones"], { x: chest.x, y: [chest.y[0], chest.y[1] + .05] }, .26),
    film(["hand_bones", "arm_bones"], box("hand_bones", .03, RIGHT), .3, RIGHT),
  ];
}

export function pickAnatomy(id: StructureId | null) {
  const s = useSim.getState(), a = s.modules.anatomy;
  if (!a) return;
  s.set({ modules: { ...s.modules, anatomy: { ...a, highlight: id } } });
  if (id) noteFocus({ kind: "body_part", label: `${STRUCTURES[id].name} (Anatomy Lab)`, detail: STRUCTURES[id].what, id });
}

const at = (m: Meta | undefined, x: number, y: number, z: number): Vec3 => m ? [m.min[0] + (m.max[0] - m.min[0]) * x, FLOOR + m.min[1] + (m.max[1] - m.min[1]) * y, m.min[2] + (m.max[2] - m.min[2]) * z] : [0, 1, 0];
const centerOf = (id: string): Vec3 => { const c = META[id]?.center ?? [0, 1, 0]; return [c[0], c[1] + FLOOR, c[2]]; };

/** The model clock: seconds of model time, advanced by `speed` while playing. */
function useClock(a: AnatomyState, animate: boolean) {
  const t = useRef(0);
  useFrame((_, dt) => { if (a.playing && animate) t.current += Math.min(dt, .1) * a.speed; });
  return t;
}

export function AnatomyModule({ animate }: { animate: boolean }) {
  const a = useSim(s => s.modules.anatomy) ?? DEFAULT_ANATOMY;
  const geos = use(loadBody());
  const looks = useMemo(() => anatomyLooks(a.system, a.depth), [a.system, a.depth]);
  const clock = useClock(a, animate);

  const meshes = useRef<Record<string, Mesh | null>>({});
  const groups = useRef<Record<string, Group | null>>({});
  const heart = a.instrument === "heart" ? anatomyHeart(a) : null;
  const breath = a.instrument === "breathing" ? anatomyBreath(a) : null;

  useFrame(({ clock: real }) => {
    const t = clock.current, mats = materials();
    // Highlight: a soft emissive pulse on the chosen structure.
    for (const [id, m] of Object.entries(mats.solid)) {
      const lit = a.highlight === id;
      m.emissive.set(lit ? META[id].color : "#000000");
      m.emissiveIntensity = lit ? .35 + .25 * Math.sin(real.elapsedTime * 4) : 0;
    }
    pulse.front.value = -1;
    const hg = groups.current.heart;
    if (heart && hg) {
      const phase = (t % heart.periodS) / heart.periodS, k = Math.min(heart.t.length - 1, Math.floor(phase * heart.t.length));
      const v = heart.lvVolume[k];
      hg.scale.setScalar(1 + HEART_EXAGGERATION * (Math.cbrt((650 + v) / (650 + heart.edv)) - 1));
      // The pressure pulse leaves the aortic valve when ejection starts and runs at the pulse-wave speed.
      const sinceOpen = phase * heart.periodS - (heart.lubS + .05);
      pulse.front.value = sinceOpen > 0 ? sinceOpen * pulseWaveVelocity(a.arterialStiffness) : -1;
    } else hg?.scale.setScalar(1);
    for (const id of ["lung_left", "lung_right"]) {
      const g = groups.current[id];
      if (!g) continue;
      if (!breath) { g.scale.setScalar(1); continue; }
      const k = Math.min(breath.t.length - 1, Math.floor(((t % breath.periodS) / breath.periodS) * breath.t.length));
      g.scale.setScalar(Math.cbrt((LUNG_VOLUMES.frc + breath.volume[k]) / LUNG_VOLUMES.frc));
    }
    const dg = groups.current.diaphragm;
    if (dg) {
      if (breath) {
        const k = Math.min(breath.t.length - 1, Math.floor(((t % breath.periodS) / breath.periodS) * breath.t.length));
        dg.position.y = (META.diaphragm?.center[1] ?? 0) - (diaphragmTravelCm(breath.tidalVolume) / 100) * (breath.tidalVolume > 0 ? breath.volume[k] / breath.tidalVolume : 0);
      } else dg.position.y = META.diaphragm?.center[1] ?? 0;
    }
  });

  // One raycast per click (not per pointer move): the body has ~300k triangles.
  const { camera, gl } = useThree();
  const root = useRef<Group>(null);
  useEffect(() => {
    const el = gl.domElement, ray = new Raycaster(), ndc = new Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY]; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4 || !root.current) return;
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(root.current.children, true).find(h => (h.object.userData as { look?: Look }).look === "solid");
      const id = (hit?.object.userData as { id?: string } | undefined)?.id;
      if (id && id in STRUCTURES) pickAnatomy(useSim.getState().modules.anatomy?.highlight === id ? null : id as StructureId);
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    return () => { el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointerup", onUp); };
  }, [camera, gl]);

  const labelIds = [...looks].filter(([id, look]) => look === "solid" && id in STRUCTURES && (a.labels || a.highlight === id)).map(([id]) => id);
  if (a.highlight && !labelIds.includes(a.highlight)) labelIds.push(a.highlight);

  return <group>
    <group ref={root} position={[0, FLOOR, 0]}>
      {Object.keys(META).map(id => {
        const look = looks.get(id), g = geos[id];
        if (!look || !g) return null;
        const c = META[id].center;
        // Moving parts scale about their own centre.
        return <group key={id} position={[c[0], c[1], c[2]]} ref={el => { groups.current[id] = el; }}>
          <mesh geometry={g} position={[-c[0], -c[1], -c[2]]} material={look === "solid" ? materials().solid[id] : materials().ghost[id]} castShadow={look === "solid" && (id === "skin" || META[id].system === "skeletal")} receiveShadow={look === "solid"} renderOrder={look === "ghost" ? 2 : id.startsWith("lung_") ? 1 : 0} userData={{ id, look }} ref={el => { meshes.current[id] = el; }} />
        </group>;
      })}
    </group>
    {looks.has("skin") && <ModestyCover ghost={looks.get("skin") === "ghost"} />}
    {labelIds.map(id => <Html key={id} position={centerOf(id)} center><div className={`tag pointer-events-none text-[12px] font-bold ${a.highlight === id ? "ring-2 ring-[var(--accent)]" : ""}`}>{STRUCTURES[id as StructureId]?.name ?? META[id]?.name ?? id}</div></Html>)}
    {looks.get("spinal_cord") === "solid" && <NerveNetwork />}
    {a.instrument === "nerve" && <ReflexArc a={a} clock={clock} />}
    {a.instrument === "digestion" && <FoodBolus a={a} animate={animate} />}
    {a.instrument === "kidney" && <UrineFlow a={a} animate={animate} groups={groups} />}
    <Monitor a={a} clock={clock} />
  </group>;
}

/** A soft frosted shape over the groin that fades out at its edges, so it reads as a blur. */
function ModestyCover({ ghost }: { ghost: boolean }) {
  const mat = useMemo(() => {
    // Lit like the skin (so it matches it), fading out towards its rim like a blur.
    const m = new MeshStandardMaterial({ color: ghost ? "#cfe8f2" : META.skin?.color ?? "#e8b99c", roughness: .7, transparent: true, depthWrite: false, opacity: ghost ? .5 : 1 });
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\ndiffuseColor.a *= smoothstep(0.08, 0.6, abs(dot(normalize(normal), normalize(vViewPosition))));");
    };
    return m;
  }, [ghost]);
  useEffect(() => () => mat.dispose(), [mat]);
  const c = groin.min.clone().add(groin.max).multiplyScalar(.5), h = groin.max.clone().sub(groin.min).multiplyScalar(.5);
  // A thin frosted shell just over the smoothed skin.
  return <mesh position={[c.x, c.y + FLOOR, c.z]} scale={[h.x * 1.15, h.y * 1.05, h.z * 1.08]} material={mat} renderOrder={3}><sphereGeometry args={[1, 32, 20]} /></mesh>;
}

/**
 * Major peripheral nerves, drawn: BodyParts3D has the brain, spinal cord and
 * cranial nerves but no nerves in the limbs. Each runs along the real bones it
 * follows in life: brachial plexus → arm, femoral nerve down the front of the
 * thigh, sciatic nerve down the back of the thigh and leg.
 */
function nerveCurves() {
  const cord = META.spinal_cord, pelvis = META.pelvis;
  const y = (v: number) => v + FLOOR;
  const cordAt = (h: number): Vector3 => new Vector3(cord?.center[0] ?? 0, y(cord ? cord.min[1] + (cord.max[1] - cord.min[1]) * h : 1.1), (cord?.center[2] ?? -.05));
  const curves: { id: string; side: -1 | 1; curve: CatmullRomCurve3; radius: number }[] = [];
  for (const side of [-1, 1] as const) {
    const sh = sideBoxes.shoulder_bones?.[side], arm = sideBoxes.arm_bones?.[side], hand = sideBoxes.hand_bones?.[side];
    const fem = sideBoxes.femur?.[side], leg = sideBoxes.leg_bones?.[side], foot = sideBoxes.foot_bones?.[side];
    const mid = (b: Box | undefined, k: number) => b ? (b.min[k] + b.max[k]) / 2 : 0;
    if (sh && arm && hand) {
      const elbowY = arm.min[1] + (arm.max[1] - arm.min[1]) * .55;
      curves.push({ id: "arm", side, radius: .0045, curve: new CatmullRomCurve3([
        cordAt(.86), new Vector3(side * .06, y(sh.min[1] + .02), mid(sh, 2) + .01), new Vector3(mid(arm, 0) - side * .012, y(arm.max[1] - .06), mid(arm, 2) + .015),
        new Vector3(mid(arm, 0) - side * .015, y(elbowY), mid(arm, 2) + .02), new Vector3(mid(arm, 0), y(arm.min[1] + .03), mid(arm, 2) + .015), new Vector3(mid(hand, 0), y(mid(hand, 1)), mid(hand, 2) + .01),
      ]) });
    }
    if (fem && leg && foot && pelvis) {
      const knee = fem.min[1] + .02;
      curves.push({ id: "femoral", side, radius: .0045, curve: new CatmullRomCurve3([
        cordAt(.02), new Vector3(side * .05, y(pelvis.center[1]), pelvis.max[2] - .02), new Vector3(side * .08, y(pelvis.min[1] + .03), pelvis.max[2] + .01),
        new Vector3(mid(fem, 0) + side * .005, y((fem.max[1] + knee) / 2 + .1), fem.max[2] + .03), new Vector3(mid(fem, 0), y(knee + .06), fem.max[2] + .025),
      ]) });
      curves.push({ id: "sciatic", side, radius: .0065, curve: new CatmullRomCurve3([
        cordAt(0), new Vector3(side * .03, y(pelvis.center[1] - .01), pelvis.min[2] + .02), new Vector3(side * .07, y(pelvis.min[1] + .02), pelvis.min[2] + .015),
        new Vector3(mid(fem, 0), y((fem.max[1] + fem.min[1]) / 2), fem.min[2] - .02), new Vector3(mid(fem, 0), y(knee), fem.min[2] - .015),
        new Vector3(mid(leg, 0), y((leg.max[1] + leg.min[1]) / 2), leg.min[2] - .01), new Vector3(mid(foot, 0), y(foot.max[1]), mid(foot, 2) - .02),
      ]) });
    }
  }
  return curves;
}

function NerveNetwork() {
  const tubes = useMemo(() => nerveCurves().map(n => ({ ...n, geo: new TubeGeometry(n.curve, 64, n.radius, 6, false) })), []);
  useEffect(() => () => tubes.forEach(t => t.geo.dispose()), [tubes]);
  return <group>{tubes.map(t => <mesh key={`${t.id}${t.side}`} geometry={t.geo}><meshStandardMaterial color="#f2d76b" emissive="#b8901c" emissiveIntensity={.35} roughness={.5} /></mesh>)}</group>;
}

/** The knee-jerk loop: stretch signal up the right femoral nerve to the spinal cord and straight back. */
function ReflexArc({ a, clock }: { a: AnatomyState; clock: { current: number } }) {
  const curve = useMemo(() => nerveCurves().find(n => n.id === "femoral" && n.side === RIGHT)?.curve ?? null, []);
  const dot = useRef<Mesh>(null), flash = useRef<Mesh>(null);
  const r = reflexLatencyMs(a.fiber), cycle = (r.latencyMs / 1000) * NERVE_SLOWDOWN + 1.2;
  useFrame(() => {
    if (!curve) return;
    const t = (clock.current % cycle) / NERVE_SLOWDOWN * 1000; // model ms
    const up = t / r.afferentMs, back = (t - r.afferentMs - r.synapseMs) / r.efferentMs;
    if (dot.current) {
      // The curve runs from the spinal cord (0) to the knee (1).
      const along = up <= 1 ? 1 - up : back >= 0 && back <= 1 ? back : null;
      dot.current.visible = along !== null;
      if (along !== null) dot.current.position.copy(curve.getPoint(Math.min(1, Math.max(0, along))));
      (dot.current.material as MeshStandardMaterial).emissive.set(up <= 1 ? "#ffd24a" : "#5ee08f");
    }
    if (flash.current) flash.current.visible = up > 1 && back < 0;
  });
  if (!curve) return null;
  const cordEnd = curve.getPoint(0), knee = curve.getPoint(1);
  return <group>
    <mesh ref={dot}><sphereGeometry args={[.014, 16, 12]} /><meshStandardMaterial color="#ffffff" emissive="#ffd24a" emissiveIntensity={2} toneMapped={false} /></mesh>
    <mesh ref={flash} position={cordEnd}><sphereGeometry args={[.028, 16, 12]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>
    <Html position={[knee.x, knee.y - .06, knee.z]} center><div className="tag pointer-events-none text-[11px] font-bold">Knee tap · slowed {NERVE_SLOWDOWN}×</div></Html>
  </group>;
}

/** Kidney model, time-lapsed at one hour per second: droplets down each ureter fill the bladder until it empties. */
function UrineFlow({ a, animate, groups }: { a: AnatomyState; animate: boolean; groups: { current: Record<string, Group | null> } }) {
  const k = kidneyBalance(a.waterIntakeL);
  const curves = useMemo(() => {
    const bladder = META.bladder, top = bladder ? new Vector3(bladder.center[0], FLOOR + bladder.max[1], bladder.center[2]) : new Vector3(0, 1.15, 0);
    return ([-1, 1] as const).flatMap(side => {
      const kid = META[side === RIGHT ? "kidney_right" : "kidney_left"];
      if (!kid) return [];
      const hilum = new Vector3(kid.center[0] - side * .025, FLOOR + kid.center[1] - .02, kid.center[2] + .01);
      const pelvisBrim = new Vector3(side * .05, FLOOR + (META.pelvis?.max[1] ?? 1.03) - .04, (META.pelvis?.center[2] ?? 0) - .01);
      return [new CatmullRomCurve3([hilum, new Vector3(hilum.x - side * .01, hilum.y - .08, hilum.z - .01), pelvisBrim, new Vector3(top.x + side * .02, top.y + .005, top.z - .01)])];
    });
  }, []);
  const drops = useRef<(Mesh | null)[]>([]);
  const hours = useRef(0);
  const label = useRef<HTMLDivElement>(null);
  useFrame((_, dt) => {
    if (a.playing && animate) hours.current += Math.min(dt, .1) * a.speed;
    const fill = (hours.current % k.bladderHours) / k.bladderHours;
    const bg = groups.current.bladder;
    if (bg) bg.scale.setScalar(.55 + .6 * Math.cbrt(fill));
    // Droplet spacing follows urine flow: more water drunk, more drops.
    const per = Math.max(2, Math.min(7, Math.round(k.urineL * 2.5)));
    drops.current.forEach((d, i) => {
      if (!d) return;
      const c = curves[i % curves.length], n = Math.floor(i / curves.length);
      d.visible = !!c && n < per;
      if (c && d.visible) d.position.copy(c.getPoint(((hours.current * .6 + n / per) % 1)));
    });
    if (label.current) label.current.textContent = `Bladder ${Math.round(fill * 100)}% full · ${(k.urineL * 1000 / 24).toFixed(0)} mL/h`;
  });
  const urine = k.osm > 900 ? "#d9a520" : k.osm > 400 ? "#f1d25a" : "#f6ec9e";
  return <group>
    {Array.from({ length: 14 }, (_, i) => <mesh key={i} ref={el => { drops.current[i] = el; }}><sphereGeometry args={[.008, 10, 8]} /><meshStandardMaterial color={urine} emissive={urine} emissiveIntensity={.6} /></mesh>)}
    <Html position={[.3, 1.05, .2]} center><div ref={label} className="tag pointer-events-none text-[12px] font-bold tabular-nums" /></Html>
  </group>;
}

/** A meal moving through the gut, one hour of model time per second. */
function FoodBolus({ a, animate }: { a: AnatomyState; animate: boolean }) {
  const curve = useMemo(() => {
    const skull = META.skull, eso = META.esophagus, li = META.large_intestine;
    const right = (META.kidney_right?.center[0] ?? -.05) < 0 ? 0 : 1; // the person's right side, in mesh x
    const pts: Vec3[] = [
      skull ? [0, FLOOR + skull.min[1] + .05, skull.max[2] - .03] : [0, 1.55, .08],
      eso ? [eso.center[0], FLOOR + eso.max[1], eso.center[2]] : [0, 1.45, 0],
      eso ? [eso.center[0], FLOOR + eso.min[1], eso.center[2]] : [0, 1.2, 0],
      centerOf("stomach"), centerOf("small_intestine"),
      at(li, right ? .85 : .15, .2, .55), at(li, right ? .85 : .15, .85, .55), at(li, right ? .15 : .85, .85, .55), at(li, right ? .15 : .85, .2, .55),
      centerOf("rectum"),
    ];
    return new CatmullRomCurve3(pts.map(p => new Vector3(...p)));
  }, []);
  // Where each stage starts along the curve: mouth, oesophagus, stomach, small intestine (to the caecum), colon, rectum.
  const knots = [0, 1 / 9, 2 / 9, 3 / 9, 5 / 9, 8 / 9, 1];
  const ball = useRef<Mesh>(null);
  const hours = useRef(a.hoursAfterMeal);
  useEffect(() => { hours.current = a.hoursAfterMeal; }, [a.hoursAfterMeal]);
  const label = useRef<HTMLDivElement>(null);
  useFrame((_, dt) => {
    if (a.playing && animate) hours.current = (hours.current + Math.min(dt, .1) * DIGEST_HOURS_PER_S * a.speed) % 72;
    const d = digestionAt(hours.current), u = knots[d.index] + (knots[d.index + 1] - knots[d.index]) * d.progress;
    ball.current?.position.copy(curve.getPoint(Math.min(1, u)));
    if (label.current) label.current.textContent = `${hours.current.toFixed(1)} h · ${d.stage.name}`;
  });
  return <group>
    <mesh ref={ball}><sphereGeometry args={[.028, 18, 14]} /><meshStandardMaterial color="#ffe08a" emissive="#ffb84a" emissiveIntensity={1.4} toneMapped={false} /></mesh>
    <Html position={[.42, 1.25, .2]} center><div ref={label} className="tag pointer-events-none text-[12px] font-bold tabular-nums" /></Html>
  </group>;
}

/** A patient monitor beside the dais, drawing the live model's trace. */
let screen: { canvas: HTMLCanvasElement; tex: CanvasTexture } | null = null;
function monitorScreen() {
  if (screen) return screen;
  const canvas = document.createElement("canvas");
  canvas.width = 640; canvas.height = 400;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return (screen = { canvas, tex });
}

function Monitor({ a, clock }: { a: AnatomyState; clock: { current: number } }) {
  const last = useRef(0);
  const ap = useMemo(() => a.instrument === "nerve" ? actionPotential(a.stimulusUA) : null, [a.instrument, a.stimulusUA]);
  useFrame(({ clock: real }) => {
    if (real.elapsedTime - last.current < 1 / 20) return;
    last.current = real.elapsedTime;
    const { canvas, tex } = monitorScreen();
    drawMonitor(canvas.getContext("2d")!, a, clock.current, ap);
    tex.needsUpdate = true;
  });
  return <group position={[1.45, 0, -.95]} rotation={[0, .45, 0]}>
    <mesh position={[0, .03, 0]} castShadow><cylinderGeometry args={[.28, .3, .06, 24]} /><meshStandardMaterial color="#c9ced1" /></mesh>
    <mesh position={[0, .7, 0]} castShadow><cylinderGeometry args={[.025, .025, 1.35, 12]} /><meshStandardMaterial color="#aeb6ba" metalness={.4} roughness={.4} /></mesh>
    <group position={[0, 1.45, .04]} rotation={[-.08, 0, 0]}>
      <mesh castShadow><boxGeometry args={[.86, .58, .07]} /><meshStandardMaterial color="#2f3a3e" roughness={.5} /></mesh>
      <mesh position={[0, 0, .037]}><planeGeometry args={[.8, .5]} /><meshBasicMaterial map={monitorScreen().tex} toneMapped={false} /></mesh>
    </group>
  </group>;
}

/** Sample index for point i of n on a trace `cycles` periods wide that ends at `phase`. */
function sweep(i: number, n: number, phase: number, cycles: number) {
  const c = phase - cycles + (cycles * i) / (n - 1);
  return Math.min(n - 1, Math.floor((((c % 1) + 1) % 1) * n));
}

function drawMonitor(g: CanvasRenderingContext2D, a: AnatomyState, t: number, ap: ReturnType<typeof actionPotential> | null) {
  const W = 640, H = 400;
  g.fillStyle = "#071216"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(120,190,180,0.12)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 260); g.stroke(); }
  for (let y = 0; y < 260; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const text = (s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") => { g.fillStyle = color; g.font = `700 ${size}px system-ui, sans-serif`; g.textAlign = align; g.fillText(s, x, y); };
  const trace = (n: number, value: (i: number) => number, lo: number, hi: number, color: string, upTo = n) => {
    g.strokeStyle = color; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i < upTo; i++) { const x = (i / (n - 1)) * W, y = 240 - ((value(i) - lo) / (hi - lo)) * 220; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  };
  if (a.instrument === "heart") {
    const h = anatomyHeart(a), n = h.t.length, phase = (t % h.periodS) / h.periodS;
    // Two beats wide, scrolling, with the newest sample at the right edge.
    const k = (i: number) => sweep(i, n, phase, 2);
    trace(n, i => h.aorticPressure[k(i)], 40, 170, "#ff6b6b");
    trace(n, i => h.lvPressure[k(i)], 0, 170, "rgba(255,215,90,0.7)");
    text("Aortic pressure", 14, 28, 20, "#ff8a8a"); text("Left ventricle", 14, 52, 18, "#ffd75a");
    text(`${Math.round(a.heartRateBpm)}`, 160, 330, 64, "#7dffb0", "right"); text("bpm", 168, 330, 20, "#7dffb0");
    text(`${Math.round(h.systolic)}/${Math.round(h.diastolic)}`, 440, 330, 58, "#ff8a8a", "right"); text("mmHg", 448, 330, 20, "#ff8a8a");
    text(`SV ${Math.round(h.strokeVolume)} mL  ·  CO ${h.cardiacOutput.toFixed(1)} L/min  ·  EF ${Math.round(h.ejectionFraction * 100)}%`, 14, 385, 20, "#cfe3e0");
  } else if (a.instrument === "breathing") {
    const b = anatomyBreath(a), n = b.t.length, phase = (t % b.periodS) / b.periodS;
    trace(n, i => b.volume[sweep(i, n, phase, 1.5)], -.05, Math.max(.7, b.tidalVolume * 1.2), "#6ec8ff");
    trace(n, i => b.flow[sweep(i, n, phase, 1.5)], -1.2, 1.2, "rgba(170,240,200,0.6)");
    text("Lung volume", 14, 28, 20, "#8fd6ff"); text("Airflow", 14, 52, 18, "#aaf0c8");
    text(`${Math.round(a.breathsPerMin)}`, 160, 330, 64, "#8fd6ff", "right"); text("/min", 168, 330, 20, "#8fd6ff");
    text(`${Math.round(b.tidalVolume * 1000)}`, 440, 330, 58, "#e0f2ff", "right"); text("mL / breath", 448, 330, 20, "#e0f2ff");
    const gas = anatomyGas(a);
    text(`SpO₂ ${Math.round(gas.spo2 * 100)}%`, 630, 28, 26, gas.spo2 < .92 ? "#ff8a8a" : "#7dffb0", "right");
    text(`CO₂ ${Math.round(gas.paco2)} mmHg`, 630, 56, 20, "#cfe3e0", "right");
    text(`Air in per minute ${b.minuteVentilation.toFixed(1)} L  ·  O₂ used ${Math.round(gas.vo2)} mL/min  ·  trapped ${Math.round(b.trapped * 1000)} mL`, 14, 385, 20, "#cfe3e0");
  } else if (a.instrument === "nerve" && ap) {
    const n = ap.t.length, upTo = Math.floor(((t * 1000 / NERVE_SLOWDOWN) % 40 / 20) * n);
    trace(n, i => ap.v[i], -90, 60, "#ffd24a", Math.min(n, Math.max(2, upTo)));
    text("Membrane potential (Hodgkin–Huxley), 20 ms", 14, 28, 20, "#ffe08a");
    text(`${Math.round(ap.peakMv)}`, 160, 330, 64, ap.fired ? "#7dffb0" : "#ff8a8a", "right"); text("mV peak", 168, 330, 20, "#cfe3e0");
    const r = reflexLatencyMs(a.fiber);
    text(`${Math.round(r.latencyMs)}`, 470, 330, 58, "#e0f2ff", "right"); text("ms reflex", 478, 330, 20, "#e0f2ff");
    text(`${FIBERS[a.fiber].label}: ${FIBERS[a.fiber].velocity} m/s  ·  ${ap.fired ? "fired" : "below threshold"}`, 14, 385, 20, "#cfe3e0");
  } else if (a.instrument === "digestion") {
    const d = digestionAt(a.hoursAfterMeal);
    let x = 14;
    const total = DIGESTION_STAGES.reduce((s, st) => s + Math.max(st.hours, 1.5), 0);
    DIGESTION_STAGES.forEach((st, i) => {
      const w = ((Math.max(st.hours, 1.5)) / total) * (W - 28);
      g.fillStyle = i === d.index ? "#ffb84a" : "rgba(255,200,120,0.25)"; g.fillRect(x, 120, w - 4, 60);
      x += w;
    });
    text("Where is lunch?", 14, 40, 26, "#ffe08a");
    text(d.stage.name, 14, 90, 30, "#ffffff");
    text(`${DIGESTION_STAGES.length} stages · typical adult times`, 14, 230, 20, "#cfe3e0");
    text(d.stage.what.slice(0, 58), 14, 300, 20, "#e8f3f1");
    text(d.stage.what.slice(58, 116), 14, 328, 20, "#e8f3f1");
  } else if (a.instrument === "kidney") {
    const k = kidneyBalance(a.waterIntakeL);
    text("Kidneys: water balance per day", 14, 34, 24, "#ffe08a");
    const bar = (y: number, label: string, value: number, max: number, color: string, unit: string) => {
      g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(200, y - 18, 420, 26);
      g.fillStyle = color; g.fillRect(200, y - 18, Math.max(4, (value / max) * 420), 26);
      text(label, 14, y + 2, 20, "#cfe3e0"); text(unit, 612, y + 2, 18, "#071216", "right");
    };
    bar(90, "Filtered", k.filteredL, 180, "#6ec8ff", `${Math.round(k.filteredL)} L`);
    bar(140, "Water drunk", a.waterIntakeL, 5, "#8fe0c8", `${a.waterIntakeL.toFixed(1)} L`);
    bar(190, "Urine", k.urineL, 5, "#f1d25a", `${k.urineL.toFixed(1)} L`);
    text(`${(k.reabsorbed * 100).toFixed(1)}%`, 220, 320, 58, "#7dffb0", "right"); text("taken back", 228, 320, 20, "#7dffb0");
    text(`${Math.round(k.osm)}`, 520, 320, 58, k.dehydrated ? "#ffb84a" : "#e0f2ff", "right"); text("mOsm/kg", 528, 320, 20, "#e0f2ff");
    text(k.dehydrated ? "Drinking too little: urine is as concentrated as kidneys can make it." : `Bladder fills in about ${k.bladderHours.toFixed(1)} h`, 14, 385, 20, "#cfe3e0");
  } else {
    text("SimuBox body lab", W / 2, 150, 34, "#7dd9c8", "center");
    text("Choose a live model in Controls", W / 2, 200, 22, "#cfe3e0", "center");
    text("heart · lungs · nerve · gut · kidney", W / 2, 236, 20, "#8fb8b2", "center");
  }
}
