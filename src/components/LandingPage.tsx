"use client";

import { animate, spring } from "animejs";
import { ArrowRight, ArrowUp, Bookmark, FlaskConical, LogIn, LogOut, Orbit, Plus, Trash, Trophy, User, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ago, openWorld, resetToNewExperiment, WORLD_ITEMS } from "@/components/ui/chrome";
import { STARTERS } from "@/components/ui/composer";
import { ask } from "@/lib/ask";
import { MOLECULES, type MoleculeId } from "@/lib/engine/chemistry";
import { solveProjectile } from "@/lib/engine/projectile";
import { initFirebase, signIn, signOutUser, useAuth } from "@/lib/firebase";
import { cancelPlayback } from "@/lib/player";
import { deleteExperiment, listExperiments, restoreExperiment, type SavedExperiment } from "@/lib/saves";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { LIMITS } from "@/lib/world/catalog";

export type HookConfig =
  | { mode: "projectile"; angleDeg: number; speed: number }
  | { mode: "gravity"; g: number }
  | { mode: "molecule"; formula: MoleculeId };

/** Transfers the landing page's interactive mini-experiment state directly into the 3D studio. */
export function applyHookToStudio(cfg: HookConfig) {
  cancelPlayback();
  const s = useSim.getState();
  if (cfg.mode === "projectile") {
    s.loadWorld("court");
    s.set({ topic: `Throw a basketball at ${cfg.angleDeg}° and ${cfg.speed} m/s` });
    s.setProjectile({ angleDeg: cfg.angleDeg, speed: cfg.speed, gravity: 9.81, height: 0, ball: "basketball" }, true);
  } else if (cfg.mode === "gravity") {
    s.loadWorld("bedroom");
    s.set({ gravity: [0, cfg.g === 0 ? 0 : -cfg.g, 0], topic: cfg.g === 0 ? "Zero gravity in the bedroom" : `Gravity set to ${cfg.g} m/s²` });
  } else {
    s.loadWorld("lab");
    const mol = MOLECULES[cfg.formula];
    s.set({ topic: `${mol.name} (${mol.formula}) molecule` });
    useSim.getState().upsertObject({
      id: "hook_mol",
      type: "molecule",
      molecule: cfg.formula,
      label: `${mol.name} (${mol.formula})`,
      position: [0, 2.1, 0],
      rotation: [0, 0, 0],
      scale: 1,
      physics: "none",
      massKg: 1,
      bounciness: 0,
      drag: 0,
      visible: true,
      version: 0,
    });
  }
}

const GRAVITY_PRESETS = [
  { label: "Zero-G", g: 0, hint: "0 m/s²", lift: -30, tilt: 16, shadowScale: 0.45, quote: "Whoa—zero gravity! Everything in the room is floating!" },
  { label: "Moon", g: 1.62, hint: "1.62 m/s²", lift: -17, tilt: 8, shadowScale: 0.68, quote: "On the Moon, gravity is 6× weaker—objects drift down in slow motion." },
  { label: "Earth", g: 9.81, hint: "9.81 m/s²", lift: 0, tilt: 0, shadowScale: 1, quote: "Normal Earth gravity: objects rest on the table at 9.81 m/s²." },
  { label: "Jupiter", g: 24.79, hint: "24.8 m/s²", lift: 4, tilt: 0, shadowScale: 1.2, quote: "Heavy! Jupiter pulls 2.5× harder than Earth—everything is pinned down!" },
] as const;

interface ArmDef {
  deg: number;
  len: number;
  el: string;
  color: string;
  active: boolean;
}

interface MolVisual {
  id: MoleculeId;
  angle: string;
  quote: string;
  center: { el: string; color: string };
  doubleBond?: boolean;
  arms: [ArmDef, ArmDef, ArmDef, ArmDef];
}

const MOLECULE_PRESETS: MolVisual[] = [
  {
    id: "H2O",
    angle: "104.5° bent",
    quote: "Oxygen's 2 lone electron pairs push the hydrogens into a 104.5° V-shape!",
    center: { el: "O", color: "#ef4444" },
    arms: [
      { deg: 142.25, len: 42, el: "H", color: "#ffffff", active: true },
      { deg: 37.75, len: 42, el: "H", color: "#ffffff", active: true },
      { deg: -90, len: 10, el: "H", color: "#ffffff", active: false },
      { deg: 90, len: 10, el: "H", color: "#ffffff", active: false },
    ],
  },
  {
    id: "CO2",
    angle: "180° linear",
    quote: "No lone pairs on carbon—the two oxygens pull opposite in a straight 180° line.",
    center: { el: "C", color: "#475569" },
    doubleBond: true,
    arms: [
      { deg: 180, len: 52, el: "O", color: "#ef4444", active: true },
      { deg: 0, len: 52, el: "O", color: "#ef4444", active: true },
      { deg: -90, len: 10, el: "H", color: "#ffffff", active: false },
      { deg: 90, len: 10, el: "H", color: "#ffffff", active: false },
    ],
  },
  {
    id: "CH4",
    angle: "109.5° tetrahedral",
    quote: "Four C–H bonds spread out equally in 3D space at 109.5°.",
    center: { el: "C", color: "#475569" },
    arms: [
      { deg: 148, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: 32, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: -90, len: 40, el: "H", color: "#ffffff", active: true },
      { deg: 78, len: 34, el: "H", color: "#ffffff", active: true },
    ],
  },
  {
    id: "NH3",
    angle: "107.8° pyramid",
    quote: "One lone pair on top nudges the three hydrogens into a 3D tripod!",
    center: { el: "N", color: "#3b82f6" },
    arms: [
      { deg: 145, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: 35, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: 90, len: 38, el: "H", color: "#ffffff", active: true },
      { deg: -90, len: 10, el: "H", color: "#ffffff", active: false },
    ],
  },
];

const GRAVITY_BASE = [
  { x: 176, y: 86, shadowX: 176, shadowY: 100, rx: 14, ry: 4.8, dir: -1 },
  { x: 232, y: 91, shadowX: 232, shadowY: 104, rx: 19, ry: 5.4, dir: 1 },
  { x: 288, y: 87, shadowX: 288, shadowY: 100, rx: 15, ry: 4.8, dir: -0.8 },
] as const;

export default function LandingPage() {
  const motion = useMotion();
  const user = useAuth((a) => a.user);
  const available = useAuth((a) => a.available);
  const ready = useAuth((a) => a.ready);
  const authError = useAuth((a) => a.error);

  const [mode, setMode] = useState<"projectile" | "gravity" | "molecule">("projectile");
  const [angleDeg, setAngleDeg] = useState(42);
  const [speed, setSpeed] = useState(9);
  const [gIndex, setGIndex] = useState(0);
  const [molId, setMolId] = useState<MoleculeId>("H2O");
  const [prompt, setPrompt] = useState("");
  const [saves, setSaves] = useState<SavedExperiment[] | null>(null);
  const [savesOpen, setSavesOpen] = useState(false);

  const studioLinkRef = useRef<HTMLAnchorElement>(null);
  const simuRef = useRef<SVGGElement>(null);
  const ballRef = useRef<SVGGElement>(null);
  const ballShadowRef = useRef<SVGEllipseElement>(null);
  const targetRingRef = useRef<SVGEllipseElement>(null);
  const gravPropRefs = useRef<(SVGGElement | null)[]>([null, null, null]);
  const gravShadowRefs = useRef<(SVGEllipseElement | null)[]>([null, null, null]);
  const molGroupRef = useRef<SVGGElement>(null);
  const molBond1Refs = useRef<(SVGLineElement | null)[]>([null, null, null, null]);
  const molBond2Refs = useRef<(SVGLineElement | null)[]>([null, null, null, null]);
  const molAtomRefs = useRef<(SVGGElement | null)[]>([null, null, null, null]);
  const molStateRef = useRef(
    MOLECULE_PRESETS[0].arms.map((a) => ({ deg: a.deg, len: a.len, scale: a.active ? 1 : 0 })),
  );

  useEffect(() => {
    void initFirebase();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
  }, [motion]);

  useEffect(() => {
    let alive = true;
    listExperiments()
      .then((list) => alive && setSaves(list))
      .catch(() => alive && setSaves([]));
    return () => {
      alive = false;
    };
  }, [user]);

  const firstName = user?.name?.trim().split(/\s+/)[0] || null;
  const proj = solveProjectile({ speed, angleDeg, gravity: 9.81, height: 0 });
  const gPreset = GRAVITY_PRESETS[gIndex];
  const molPreset = MOLECULE_PRESETS.find((m) => m.id === molId) ?? MOLECULE_PRESETS[0];
  const molData = MOLECULES[molId];

  // Centered on the widest horizontal midline (y = 96) of the isometric platform
  const floorY = 96;
  const startX = 138;
  const landX = Math.min(308, Math.max(182, startX + proj.range * 13));
  const peakX = (startX + landX) / 2;
  const peakY = Math.max(28, floorY - proj.maxHeight * 17);
  const peakHeightPx = floorY - peakY;
  const controlY = 2 * peakY - floorY;
  const arcPath = `M ${startX} ${floorY} Q ${peakX} ${controlY} ${landX} ${floorY}`;

  // 1. Anime.js: Projectile flight + bounce + shadow tracking
  useEffect(() => {
    if (mode !== "projectile") return;
    const ball = ballRef.current;
    const shadow = ballShadowRef.current;
    const ring = targetRingRef.current;
    if (!ball || !shadow) return;

    const placeAt = (x: number, y: number, hRatio: number) => {
      ball.setAttribute("transform", `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
      shadow.setAttribute("cx", x.toFixed(1));
      shadow.setAttribute("rx", (11 * (1 - 0.5 * hRatio)).toFixed(1));
      shadow.setAttribute("ry", (4 * (1 - 0.5 * hRatio)).toFixed(1));
      shadow.setAttribute("opacity", (0.24 * (1 - 0.45 * hRatio)).toFixed(2));
    };

    if (!motion) {
      placeAt(landX, floorY - 5, 0);
      return;
    }

    const state = { t: 0 };
    const flightMs = Math.max(780, Math.round(proj.flightTime * 950));
    const anim = animate(state, {
      t: [0, 1.32],
      duration: flightMs + 340,
      ease: "linear",
      loop: true,
      onUpdate: () => {
        const t = state.t;
        if (t <= 1) {
          // Main parabolic flight: y(t) = floorY - 4 * H * t * (1 - t)
          const x = startX + (landX - startX) * t;
          const h = 4 * peakHeightPx * t * (1 - t);
          placeAt(x, floorY - 5 - h, peakHeightPx > 0 ? h / peakHeightPx : 0);
        } else {
          // Playful landing bounce after hitting (landX, floorY)
          const bt = (t - 1) / 0.32;
          const x = landX + bt * 14;
          const bounceH = Math.max(6, peakHeightPx * 0.22) * 4 * bt * (1 - bt);
          placeAt(x, floorY - 5 - bounceH, 0.2);
          if (ring) {
            const pulse = 1 + 0.28 * Math.sin(bt * Math.PI);
            ring.setAttribute("rx", (14 * pulse).toFixed(1));
            ring.setAttribute("ry", (5.5 * pulse).toFixed(1));
          }
        }
      },
    });

    return () => {
      anim.pause();
    };
  }, [mode, angleDeg, speed, motion, startX, landX, floorY, peakHeightPx, proj.flightTime]);

  // 2. Anime.js: Gravity spring transition + staggered Zero-G / Moon floating loop
  useEffect(() => {
    const simu = simuRef.current;
    const simuTargetY = mode === "gravity" ? gPreset.lift * 0.48 : 0;
    const simuAnim = simu
      ? animate(
          { y: 0 },
          {
            y: simuTargetY,
            duration: motion ? 600 : 0,
            ease: spring({ bounce: 0.45, duration: 600 }),
            onUpdate: (self) => {
              const v = (self.targets[0] as { y: number }).y;
              simu.setAttribute("transform", `translate(98, ${(46 + v).toFixed(1)}) scale(1.22)`);
            },
          },
        )
      : null;

    if (mode !== "gravity") {
      return () => {
        simuAnim?.pause();
      };
    }

    const cleanups: (() => void)[] = [];
    GRAVITY_BASE.forEach((base, i) => {
      const el = gravPropRefs.current[i];
      const sh = gravShadowRefs.current[i];
      if (!el) return;

      const targetY = base.y + gPreset.lift * (i === 1 ? 1.15 : i === 2 ? 0.95 : 1);
      const targetRot = gPreset.tilt * base.dir;
      const proxy = { y: base.y, rot: 0, s: 1 };

      const dropAnim = animate(proxy, {
        y: targetY,
        rot: targetRot,
        s: gPreset.shadowScale,
        delay: motion ? i * 55 : 0,
        duration: motion ? 650 : 0,
        ease: spring({ bounce: 0.48, duration: 650 }),
        onUpdate: () => {
          el.setAttribute("transform", `translate(${base.x}, ${proxy.y.toFixed(1)}) scale(1.22) rotate(${proxy.rot.toFixed(1)})`);
          if (sh) {
            sh.setAttribute("rx", (base.rx * proxy.s).toFixed(1));
            sh.setAttribute("ry", (base.ry * proxy.s).toFixed(1));
          }
        },
      });
      cleanups.push(() => dropAnim.pause());

      // Continuous floating oscillation in Zero-G and Moon
      if (motion && gPreset.g < 9) {
        const floatProxy = { dy: 0, drot: 0 };
        const floatAnim = animate(floatProxy, {
          dy: [-5, 5],
          drot: [-4 * base.dir, 4 * base.dir],
          duration: 1600 + i * 280,
          delay: i * 180,
          ease: "inOutSine",
          loop: true,
          alternate: true,
          onUpdate: () => {
            el.setAttribute(
              "transform",
              `translate(${base.x}, ${(proxy.y + floatProxy.dy).toFixed(1)}) scale(1.22) rotate(${(proxy.rot + floatProxy.drot).toFixed(1)})`,
            );
          },
        });
        cleanups.push(() => floatAnim.pause());
      }
    });

    return () => {
      simuAnim?.pause();
      cleanups.forEach((fn) => fn());
    };
  }, [mode, gIndex, gPreset, motion]);

  // 3. Anime.js: Molecule bond-angle spring morphing + gentle 3D hover
  useEffect(() => {
    if (mode !== "molecule") return;
    const cleanups: (() => void)[] = [];

    molPreset.arms.forEach((targetArm, i) => {
      const cur = molStateRef.current[i];
      const b1 = molBond1Refs.current[i];
      const b2 = molBond2Refs.current[i];
      const atom = molAtomRefs.current[i];

      const renderArm = () => {
        const rad = (cur.deg * Math.PI) / 180;
        const x = Math.cos(rad) * cur.len;
        const y = Math.sin(rad) * cur.len;
        const nx = -Math.sin(rad) * 3.2;
        const ny = Math.cos(rad) * 3.2;

        if (b1) {
          b1.setAttribute("x1", molPreset.doubleBond ? nx.toFixed(1) : "0");
          b1.setAttribute("y1", molPreset.doubleBond ? ny.toFixed(1) : "0");
          b1.setAttribute("x2", (molPreset.doubleBond ? x + nx : x).toFixed(1));
          b1.setAttribute("y2", (molPreset.doubleBond ? y + ny : y).toFixed(1));
          b1.setAttribute("opacity", cur.scale.toFixed(2));
        }
        if (b2) {
          b2.setAttribute("x1", (-nx).toFixed(1));
          b2.setAttribute("y1", (-ny).toFixed(1));
          b2.setAttribute("x2", (x - nx).toFixed(1));
          b2.setAttribute("y2", (y - ny).toFixed(1));
          b2.setAttribute("opacity", molPreset.doubleBond ? cur.scale.toFixed(2) : "0");
        }
        if (atom) {
          atom.setAttribute("transform", `translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${Math.max(0.01, cur.scale).toFixed(2)})`);
          atom.setAttribute("opacity", cur.scale.toFixed(2));
        }
      };

      if (!motion) {
        cur.deg = targetArm.deg;
        cur.len = targetArm.len;
        cur.scale = targetArm.active ? 1 : 0;
        renderArm();
        return;
      }

      const anim = animate(cur, {
        deg: targetArm.deg,
        len: targetArm.len,
        scale: targetArm.active ? 1 : 0,
        duration: 620,
        delay: i * 35,
        ease: spring({ bounce: 0.42, duration: 620 }),
        onUpdate: renderArm,
      });
      cleanups.push(() => anim.pause());
    });

    if (motion && molGroupRef.current) {
      const group = molGroupRef.current;
      const hoverState = { dy: 0 };
      const hoverAnim = animate(hoverState, {
        dy: [-4, 4],
        duration: 2000,
        ease: "inOutSine",
        loop: true,
        alternate: true,
        onUpdate: () => {
          group.setAttribute("transform", `translate(222, ${(68 + hoverState.dy).toFixed(1)}) scale(1.24)`);
        },
      });
      cleanups.push(() => hoverAnim.pause());
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [mode, molId, molPreset, motion]);

  const submitPrompt = (text = prompt) => {
    const clean = text.trim();
    if (!clean) return;
    useSim.getState().set({ draft: "", lessonSuggestions: [] });
    void ask(clean);
    studioLinkRef.current?.click();
  };

  const simuQuote =
    mode === "projectile"
      ? angleDeg === 45
        ? `Sweet spot! 45° gives the farthest range (${proj.range.toFixed(2)} m) at this speed.`
        : angleDeg > 55
          ? `High lob! Peaks at ${proj.maxHeight.toFixed(2)} m and lands at ${proj.range.toFixed(2)} m.`
          : `Drag the sliders—at ${angleDeg}°, the ball lands at ${proj.range.toFixed(2)} m in ${proj.flightTime.toFixed(2)} s.`
      : mode === "gravity"
        ? gPreset.quote
        : molPreset.quote;

  return (
    <main className="scroll-thin flex h-dvh w-full flex-col justify-between overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">
      <Link ref={studioLinkRef} href="/app" className="hidden" tabIndex={-1} aria-hidden />

      {/* Top Glass Header */}
      <header className="mx-auto flex w-full max-w-[980px] items-center justify-between gap-2">
        <Link href="/" className="glass btn flex items-center gap-2.5 rounded-full py-1.5 pl-2 pr-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- local static svg icon */}
          <img src="/icon.svg" alt="" className="h-8 w-8 rounded-[10px]" />
          <span className="text-[16px] font-extrabold tracking-tight text-ink">SimuBox</span>
        </Link>

        <div className="relative flex items-center gap-2">
          <button
            type="button"
            aria-expanded={savesOpen}
            onClick={() => setSavesOpen(!savesOpen)}
            className="glass btn inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold text-ink"
          >
            <Bookmark size={15} className="text-ink-2" />
            <span>Saved experiments</span>
            {saves && saves.length > 0 && (
              <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[11px] font-extrabold text-ink">{saves.length}</span>
            )}
          </button>

          {user ? (
            <>
              <div className="glass hidden items-center gap-2 rounded-full py-1 pl-1.5 pr-3 sm:flex">
                <span className="grid h-7 w-7 overflow-hidden rounded-full bg-[var(--fill)] text-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny */}
                  {user.photo ? <img src={user.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={15} className="m-auto" />}
                </span>
                <span className="max-w-[160px] truncate text-[13px] font-bold text-ink">{user.email ?? user.name}</span>
              </div>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="glass btn inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-ink-2"
                title="Sign out"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : available || !ready ? (
            <button
              type="button"
              onClick={() => void signIn()}
              className="btn btn-ink inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold"
            >
              <LogIn size={15} /> Sign in with Google
            </button>
          ) : null}

          <Link href="/app" className="btn btn-accent inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-extrabold">
            Open studio <ArrowRight size={15} strokeWidth={2.4} />
          </Link>

          {savesOpen && (
            <div className="glass sheet absolute right-0 top-12 z-40 w-[min(340px,calc(100vw-24px))] rounded-[22px] p-2.5" style={{ transformOrigin: "top right" }}>
              <div className="flex items-center justify-between px-2 pb-2 pt-1">
                <div>
                  <h2 className="text-[15px] font-extrabold text-ink">Saved experiments</h2>
                  <p className="text-[12px] font-semibold text-ink-3">{user ? `Synced to ${user.email}` : "Saved in this browser"}</p>
                </div>
                <button type="button" className="btn btn-quiet grid h-7 w-7 place-items-center rounded-full text-ink-2" aria-label="Close saved experiments" onClick={() => setSavesOpen(false)}>
                  <X size={15} />
                </button>
              </div>
              <div className="group-rows max-h-60 overflow-y-auto">
                {!saves || saves.length === 0 ? (
                  <p className="px-3 py-3 text-[13px] font-semibold text-ink-3">Nothing saved yet. Build an experiment in the studio and click “Save this one”.</p>
                ) : (
                  saves.map((e) => (
                    <div key={e.id} className="flex items-center pr-1.5">
                      <Link
                        href="/app"
                        onClick={() => {
                          cancelPlayback();
                          restoreExperiment(e);
                          setSavesOpen(false);
                        }}
                        className="btn flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left hover:bg-black/[0.03]"
                      >
                        <Bookmark size={15} className="shrink-0 text-ink-2" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-bold text-ink">{e.title}</span>
                          <span className="truncate text-[12px] font-semibold capitalize text-ink-3">
                            {e.world} · {ago(e.updatedAt)}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Delete ${e.title}`}
                        className="btn btn-quiet grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3"
                        onClick={async () => {
                          if (!confirm(`Delete “${e.title}”?`)) return;
                          await deleteExperiment(e.id);
                          setSaves(await listExperiments());
                        }}
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Center Stage: Title + Interactive Mini-Playground Hook */}
      <section className="mx-auto my-auto flex w-full max-w-[820px] flex-col items-center gap-2.5 py-1 text-center">
        {authError && (
          <p className="glass rounded-full px-4 py-1.5 text-[13px] font-semibold text-[var(--dot-warning)]" role="alert">
            {authError}
          </p>
        )}

        <div className="space-y-0.5">
          {user && (
            <p className="text-[13px] font-extrabold text-[var(--dot-info)]">
              {firstName ? `Welcome back, ${firstName}` : "Welcome back"} · {user.email}
            </p>
          )}
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[38px]">
            Ask anything. Watch it come to life.
          </h1>
          <p className="text-[14px] font-semibold text-ink-2">
            Play with the mini-experiment below, or type any question to build it in 3D.
          </p>
        </div>

        {saves && saves.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <span className="text-[12px] font-bold text-ink-3">Resume:</span>
            {saves.slice(0, 3).map((e) => (
              <Link
                key={e.id}
                href="/app"
                onClick={() => {
                  cancelPlayback();
                  restoreExperiment(e);
                }}
                className="glass btn inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold text-ink"
              >
                <Bookmark size={12} className="text-[var(--dot-info)]" />
                <span className="max-w-[160px] truncate">{e.title}</span>
              </Link>
            ))}
          </div>
        )}

        {/* THE HOOK: Interactive Studio Diorama Card */}
        <div className="glass w-full rounded-[26px] p-3 text-left sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
            <div role="group" aria-label="Try a mini experiment" className="seg grid flex-1 grid-cols-3 gap-0.5 sm:max-w-[420px]">
              <button type="button" aria-pressed={mode === "projectile"} className="flex h-8 items-center justify-center gap-1.5 px-2 text-[13px]" onClick={() => setMode("projectile")}>
                <Trophy size={14} /> Throw a ball
              </button>
              <button type="button" aria-pressed={mode === "gravity"} className="flex h-8 items-center justify-center gap-1.5 px-2 text-[13px]" onClick={() => setMode("gravity")}>
                <Orbit size={14} /> Flip gravity
              </button>
              <button type="button" aria-pressed={mode === "molecule"} className="flex h-8 items-center justify-center gap-1.5 px-2 text-[13px]" onClick={() => setMode("molecule")}>
                <FlaskConical size={14} /> Molecules
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {mode === "projectile" && (
                <>
                  <span className="tag tag-dot inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px]">Lands at {proj.range.toFixed(2)} m</span>
                  <span className="tag tag-fact tag-dot inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px]">Peak {proj.maxHeight.toFixed(2)} m</span>
                </>
              )}
              {mode === "gravity" && (
                <span className="tag tag-dot inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px]">g = {gPreset.hint}</span>
              )}
              {mode === "molecule" && (
                <span className="tag tag-question tag-dot inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px]">
                  {molData.formula} · {molPreset.angle}
                </span>
              )}
            </div>
          </div>

          {/* Interactive Stage Canvas */}
          <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-b from-[#eef3fa] to-[#dce4ef] p-3">
            <div className="mb-1.5 flex items-center gap-2.5 rounded-[14px] bg-white/95 px-3 py-2 text-[13px] font-bold text-ink shadow-xs">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span className="truncate sm:whitespace-normal">{simuQuote}</span>
            </div>

            <svg viewBox="0 0 420 176" className="h-[168px] w-full sm:h-[196px]" role="img" aria-label="Interactive science preview">
              {/* Isometric Studio Table ("Alas") */}
              <polygon points="210,14 406,96 210,162 14,96" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
              <polygon points="14,96 210,162 210,171 14,105" fill="#cbd5e1" />
              <polygon points="406,96 210,162 210,171 406,105" fill="#94a3b8" />

              {/* Simu Robot Guide positioned well inside the middle-left of the platform */}
              <ellipse cx="118" cy="100" rx="16" ry="5.5" fill="rgba(15, 23, 42, 0.13)" />
              <g ref={simuRef} transform="translate(98, 46) scale(1.22)">
                <line x1="16" y1="-6" x2="16" y2="2" stroke="#2f80ed" strokeWidth="2.2" />
                <circle cx="16" cy="-8" r="3.5" fill="#ffc531" />
                <rect x="2" y="2" width="28" height="20" rx="8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.8" />
                <rect x="6" y="6" width="20" height="11" rx="4" fill="#1c1e22" />
                <circle cx="12" cy="11.5" r="2.2" fill="#60a5fa" />
                <circle cx="20" cy="11.5" r="2.2" fill="#60a5fa" />
                <rect x="6" y="24" width="20" height="16" rx="6" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.8" />
              </g>

              {/* MODE 1: PROJECTILE (THROW A BALL) */}
              {mode === "projectile" && (
                <g>
                  {/* Court baseline across the middle of the platform */}
                  <line x1={startX} y1={floorY} x2={landX} y2={floorY} stroke="#cbd5e1" strokeWidth="1.8" strokeDasharray="4 4" />

                  {/* Parabolic flight path passing directly through (peakX, peakY) */}
                  <path d={arcPath} fill="none" stroke="#f0a800" strokeWidth="3.4" strokeDasharray="6 5" />

                  {/* Peak height marker right on the curve */}
                  <circle cx={peakX} cy={peakY} r="5.5" fill="#2f80ed" stroke="#fff" strokeWidth="1.8" />
                  <text x={peakX} y={Math.max(15, peakY - 9)} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#1c1e22">
                    {proj.maxHeight.toFixed(1)}m
                  </text>

                  {/* Landing target ring on the platform */}
                  <ellipse ref={targetRingRef} cx={landX} cy={floorY} rx="14" ry="5.5" fill="rgba(229, 72, 77, 0.22)" stroke="#e5484d" strokeWidth="1.5" />
                  <text x={landX} y={floorY + 16} textAnchor="middle" fontSize="11.5" fontWeight="800" fill="#1c1e22">
                    {proj.range.toFixed(1)}m
                  </text>

                  {/* Dynamic shadow tracking the flying basketball along the table */}
                  <ellipse ref={ballShadowRef} cx={startX} cy={floorY + 2} rx="11" ry="4" fill="rgba(15, 23, 42, 0.22)" />

                  {/* Basketball animated by Anime.js */}
                  <g ref={ballRef} transform={`translate(${startX}, ${floorY - 5})`}>
                    <circle cx="0" cy="0" r="9.5" fill="#f97316" stroke="#c2410c" strokeWidth="1.8" />
                    <path d="M -7 -4 Q 0 2 7 -4" fill="none" stroke="#9a3412" strokeWidth="1.2" />
                    <path d="M -7 4 Q 0 -2 7 4" fill="none" stroke="#9a3412" strokeWidth="1.2" />
                  </g>
                </g>
              )}

              {/* MODE 2: FLIP GRAVITY (Anime.js spring + staggered Zero-G bobbing) */}
              {mode === "gravity" && (
                <g>
                  {GRAVITY_BASE.map((b, i) => (
                    <ellipse
                      key={`sh-${i}`}
                      ref={(el) => {
                        gravShadowRefs.current[i] = el;
                      }}
                      cx={b.shadowX}
                      cy={b.shadowY}
                      rx={b.rx * gPreset.shadowScale}
                      ry={b.ry * gPreset.shadowScale}
                      fill="rgba(15, 23, 42, 0.14)"
                    />
                  ))}

                  {/* Prop 1: Basketball */}
                  <g
                    ref={(el) => {
                      gravPropRefs.current[0] = el;
                    }}
                    transform={`translate(${GRAVITY_BASE[0].x}, ${GRAVITY_BASE[0].y + gPreset.lift}) scale(1.22)`}
                  >
                    <circle cx="0" cy="0" r="10.5" fill="#f97316" stroke="#c2410c" strokeWidth="1.6" />
                    <path d="M -8 -5 Q 0 2 8 -5" fill="none" stroke="#9a3412" strokeWidth="1.2" />
                    <path d="M -8 5 Q 0 -2 8 5" fill="none" stroke="#9a3412" strokeWidth="1.2" />
                  </g>

                  {/* Prop 2: Blue Science Book */}
                  <g
                    ref={(el) => {
                      gravPropRefs.current[1] = el;
                    }}
                    transform={`translate(${GRAVITY_BASE[1].x}, ${GRAVITY_BASE[1].y + gPreset.lift * 1.15}) scale(1.22)`}
                  >
                    <rect x="-16" y="-7" width="32" height="14" rx="3.5" fill="#3b82f6" stroke="#1d4ed8" strokeWidth="1.6" />
                    <line x1="-11" y1="0" x2="11" y2="0" stroke="#eff6ff" strokeWidth="2" strokeLinecap="round" />
                  </g>

                  {/* Prop 3: Yellow Prism Block */}
                  <g
                    ref={(el) => {
                      gravPropRefs.current[2] = el;
                    }}
                    transform={`translate(${GRAVITY_BASE[2].x}, ${GRAVITY_BASE[2].y + gPreset.lift * 0.95}) scale(1.22)`}
                  >
                    <polygon points="0,-12 12,9 -12,9" fill="#ffc531" stroke="#d97706" strokeWidth="1.6" strokeLinejoin="round" />
                  </g>
                </g>
              )}

              {/* MODE 3: MOLECULES (Anime.js spring bond-angle morphing) */}
              {mode === "molecule" && (
                <g>
                  <ellipse cx="222" cy="106" rx="44" ry="9" fill="rgba(15, 23, 42, 0.13)" />
                  <g ref={molGroupRef} transform="translate(222, 68) scale(1.24)">
                    {molPreset.arms.map((arm, i) => {
                      const rad = (arm.deg * Math.PI) / 180;
                      const x = Math.cos(rad) * arm.len;
                      const y = Math.sin(rad) * arm.len;
                      const scale = arm.active ? 1 : 0;
                      return (
                        <g key={i}>
                          <line
                            ref={(el) => {
                              molBond1Refs.current[i] = el;
                            }}
                            x1="0"
                            y1="0"
                            x2={x}
                            y2={y}
                            opacity={scale}
                            stroke="#64748b"
                            strokeWidth="4.2"
                            strokeLinecap="round"
                          />
                          <line
                            ref={(el) => {
                              molBond2Refs.current[i] = el;
                            }}
                            x1="0"
                            y1="0"
                            x2={x}
                            y2={y}
                            opacity={molPreset.doubleBond ? scale : 0}
                            stroke="#64748b"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                          />
                          <g
                            ref={(el) => {
                              molAtomRefs.current[i] = el;
                            }}
                            transform={`translate(${x}, ${y}) scale(${Math.max(0.01, scale)})`}
                            opacity={scale}
                          >
                            <circle cx="0" cy="0" r={arm.el === "O" ? 13 : 10} fill={arm.color} stroke="#94a3b8" strokeWidth="1.8" />
                            <text x="0" y="3.5" textAnchor="middle" fontSize="9.5" fontWeight="800" fill={arm.el === "O" ? "#ffffff" : "#1c1e22"}>
                              {arm.el}
                            </text>
                          </g>
                        </g>
                      );
                    })}

                    {/* Central Atom */}
                    <circle cx="0" cy="0" r="15" fill={molPreset.center.color} stroke="#ffffff" strokeWidth="1.5" />
                    <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill="#ffffff">
                      {molPreset.center.el}
                    </text>
                  </g>
                </g>
              )}
            </svg>
          </div>

          {/* Interactive Controls Row + Direct 3D Handoff Button */}
          <div className="mt-3 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            {mode === "projectile" && (
              <div className="grid flex-1 grid-cols-2 gap-3 px-1">
                <label className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
                  <span>Angle</span>
                  <input
                    type="range"
                    className="slider"
                    min={15}
                    max={75}
                    value={angleDeg}
                    style={{ ["--fill" as string]: `${((angleDeg - 15) / 60) * 100}%` }}
                    onChange={(e) => setAngleDeg(Number(e.target.value))}
                  />
                  <span className="w-8 text-right tabular-nums text-ink">{angleDeg}°</span>
                </label>
                <label className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
                  <span>Speed</span>
                  <input
                    type="range"
                    className="slider"
                    min={5}
                    max={14}
                    value={speed}
                    style={{ ["--fill" as string]: `${((speed - 5) / 9) * 100}%` }}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                  <span className="w-12 text-right tabular-nums text-ink">{speed} m/s</span>
                </label>
              </div>
            )}

            {mode === "gravity" && (
              <div role="group" aria-label="Gravity preset" className="seg grid flex-1 grid-cols-4 gap-0.5">
                {GRAVITY_PRESETS.map((p, idx) => (
                  <button key={p.label} type="button" aria-pressed={gIndex === idx} className="h-8 text-[13px]" onClick={() => setGIndex(idx)}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {mode === "molecule" && (
              <div role="group" aria-label="Molecule preset" className="seg grid flex-1 grid-cols-4 gap-0.5">
                {MOLECULE_PRESETS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={molId === m.id} className="h-8 text-[13px]" onClick={() => setMolId(m.id)}>
                    {MOLECULES[m.id].formula}
                  </button>
                ))}
              </div>
            )}

            <Link
              href="/app"
              onClick={() =>
                applyHookToStudio(
                  mode === "projectile"
                    ? { mode: "projectile", angleDeg, speed }
                    : mode === "gravity"
                      ? { mode: "gravity", g: gPreset.g }
                      : { mode: "molecule", formula: molId },
                )
              }
              className="btn btn-accent inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[14px] px-4 text-[14px] font-extrabold"
            >
              Try this in 3D <ArrowRight size={16} strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom Dock: Prompt Composer + Starter Chips + 1-Line Worlds Row + Separate About/Privacy Row */}
      <footer className="mx-auto flex w-full max-w-[980px] flex-col items-center gap-2">
        <form
          className="glass flex w-full max-w-[680px] items-center gap-2 rounded-[28px] p-1.5 pl-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitPrompt();
          }}
        >
          <input
            type="text"
            value={prompt}
            maxLength={LIMITS.maxPromptChars}
            placeholder="Ask anything to simulate in 3D…"
            aria-label="Ask SimuBox anything to simulate"
            className="min-w-0 flex-1 bg-transparent py-2 text-[15px] font-semibold text-ink outline-none placeholder:text-ink-3 sm:text-[16px]"
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Link
            href="/app"
            onClick={resetToNewExperiment}
            title="Start a blank experiment"
            className="btn btn-quiet hidden h-10 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-ink-2 sm:inline-flex"
          >
            <Plus size={15} /> New
          </Link>
          <button
            type="submit"
            disabled={!prompt.trim()}
            aria-label="Send"
            className="btn btn-accent grid h-10 w-10 shrink-0 place-items-center rounded-full"
          >
            <ArrowUp size={20} strokeWidth={2.6} />
          </button>
        </form>

        {/* Starter Question Chips */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {STARTERS.slice(0, 4).map((q) => (
            <Link
              key={q}
              href="/app"
              onClick={() => {
                useSim.getState().set({ draft: "", lessonSuggestions: [] });
                void ask(q);
              }}
              className="glass btn rounded-full px-3 py-1 text-[12px] font-bold text-ink-2 hover:text-ink"
            >
              {q}
            </Link>
          ))}
        </div>

        {/* 1-Line Worlds Pill Bar (no wrap) */}
        <div className="no-scrollbar flex w-full items-center justify-start gap-1.5 overflow-x-auto py-0.5 lg:justify-center">
          {WORLD_ITEMS.map((w) => {
            const Icon = w.icon;
            return (
              <Link
                key={w.id}
                href="/app"
                title={w.hint}
                onClick={() => openWorld(w.id)}
                className="btn btn-quiet inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[var(--fill)] px-2.5 py-1 text-[12px] font-bold text-ink-2 hover:text-ink"
              >
                <Icon size={13} />
                <span>{w.name}</span>
              </Link>
            );
          })}
        </div>

        {/* About & Privacy on their own bottom row */}
        <div className="flex items-center justify-center gap-3 text-[12px] font-semibold text-ink-3">
          <Link href="/credits" className="hover:text-ink">
            About
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </div>
      </footer>
    </main>
  );
}
