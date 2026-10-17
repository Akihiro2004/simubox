"use client";

import { animate, createTimeline, onScroll, spring, stagger, type JSAnimation } from "animejs";
import { ArrowRight, ArrowUp, Bookmark, ChevronDown, LogIn, LogOut, Plus, User } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion as m } from "motion/react";
import { Segmented } from "@/components/ui/kit";
import { MorphPanel, useViewport } from "@/components/ui/morph";
import { playStudioEntrance } from "@/components/studio-transition";
import { landingView as view } from "@/components/landing-view";
import { openWorld, resetToNewExperiment, WORLD_ITEMS } from "@/components/ui/chrome";
import { STARTERS } from "@/components/ui/composer";
import { ask } from "@/lib/ask";
import { MOLECULES, type MoleculeId } from "@/lib/engine/chemistry";
import { solveProjectile } from "@/lib/engine/projectile";
import { initFirebase, signIn, signOutUser, useAuth } from "@/lib/firebase";
import { cancelPlayback } from "@/lib/player";
import { listExperiments, restoreExperiment, type SavedExperiment } from "@/lib/saves";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { spring as springs } from "@/lib/motion";
import { LIMITS } from "@/lib/world/catalog";

export type HookConfig = { mode: "projectile"; angleDeg: number; speed: number } | { mode: "gravity"; g: number } | { mode: "molecule"; formula: MoleculeId };

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
    useSim
      .getState()
      .upsertObject({
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
  { label: "Zero-G", g: 0, hint: "0 m/s²", lift: -30, tilt: 16, shadowScale: 0.45, quote: "No gravity at all, so everything just floats around the room." },
  { label: "Moon", g: 1.62, hint: "1.62 m/s²", lift: -17, tilt: 8, shadowScale: 0.68, quote: "Moon gravity is about 6x weaker, so stuff drifts down super slowly." },
  { label: "Earth", g: 9.81, hint: "9.81 m/s²", lift: 0, tilt: 0, shadowScale: 1, quote: "Regular Earth gravity. Things just sit on the table at 9.81 m/s²." },
  { label: "Jupiter", g: 24.79, hint: "24.8 m/s²", lift: 4, tilt: 0, shadowScale: 1.2, quote: "Jupiter pulls about 2.5x harder than Earth, so everything gets squished down." },
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
    quote: "Oxygen has 2 lone pairs that push the hydrogens down into a bent 104.5° shape.",
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
    quote: "Carbon has no lone pairs, so the two oxygens end up in a straight 180° line.",
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
    quote: "The four C-H bonds spread out evenly in 3D, about 109.5° apart.",
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
    quote: "One lone pair sits on top and pushes the three hydrogens into a little pyramid.",
    center: { el: "N", color: "#3b82f6" },
    arms: [
      { deg: 145, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: 35, len: 44, el: "H", color: "#ffffff", active: true },
      { deg: 90, len: 38, el: "H", color: "#ffffff", active: true },
      { deg: -90, len: 10, el: "H", color: "#ffffff", active: false },
    ],
  },
];

const LandingStage = dynamic(() => import("./LandingStage"), { ssr: false });

export default function LandingPage() {
  const motion = useMotion();
  const user = useAuth((a) => a.user);
  const available = useAuth((a) => a.available);
  const ready = useAuth((a) => a.ready);

  const [mode, setMode] = useState<"projectile" | "gravity" | "molecule">("projectile");
  const [angleDeg, setAngleDeg] = useState(42);
  const [speed, setSpeed] = useState(9);
  const [gIndex, setGIndex] = useState(0);
  const [molId, setMolId] = useState<MoleculeId>("H2O");
  const [prompt, setPrompt] = useState("");
  const [saves, setSaves] = useState<SavedExperiment[] | null>(null);

  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [chapter, setChapter] = useState<Chapter>("hero");
  const [hint, setHint] = useState(0);
  const vp = useViewport();
  const phone = vp.w < 640 || (vp.w < 1024 && vp.h > vp.w);
  useEffect(() => {
    void initFirebase();
    // Load the studio in the background so entering it is instant.
    router.prefetch("/app");
  }, [router]);

  /** Into the studio: what was clicked grows into the veil that covers the load. */
  const enter = (from: HTMLElement | null, before?: () => void) => {
    // The setup (load a world, start a question) runs once the veil covers the
    // screen, so it never costs the grow animation a frame.
    playStudioEntrance(
      from,
      () => {
        before?.();
        router.push("/app");
      },
      motion,
      pageRef.current,
    );
  };

  useLayoutEffect(() => {
    const page = pageRef.current;
    page?.style.removeProperty("transform");
    page?.style.removeProperty("opacity");
  }, []);

  // Entrance: the stage rises, the headline arrives word by word, the bars settle in.
  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const parts = root.querySelectorAll<HTMLElement>("[data-enter]");
    if (!motion) {
      parts.forEach((e) => (e.style.opacity = "1"));
      return;
    }
    const tl = createTimeline()
      .add(stageRef.current!, { opacity: { from: 0, to: 1, duration: 600, ease: "out(2)" }, translateY: { from: 60, to: 0 }, ease: spring({ bounce: 0.14, duration: 1100 }) }, 0)
      .add(
        parts,
        { opacity: { from: 0, to: 1, duration: 420, ease: "out(2)" }, translateY: { from: 18, to: 0 }, ease: spring({ bounce: 0.16, duration: 720 }), delay: stagger(90) },
        120,
      )
      .add(
        root.querySelectorAll(".hero-word"),
        {
          opacity: { from: 0, to: 1, duration: 360, ease: "out(2)" },
          translateY: { from: 28, to: 0 },
          rotate: { from: 5, to: 0 },
          ease: spring({ bounce: 0.3, duration: 760 }),
          delay: stagger(45),
        },
        200,
      );
    const cue = animate(root.querySelector(".scroll-cue")!, { translateY: [0, 6], duration: 900, ease: "inOutSine", loop: true, alternate: true, delay: 1400 });
    return () => {
      tl.revert();
      cue.revert();
    };
  }, [motion]);

  // Scroll story: each chapter switches the live demo and morphs the one glass
  // card; anime.js ties the camera and the worlds ring to the scroll, smoothed.
  useEffect(() => {
    const sc = scrollerRef.current;
    const stage = stageRef.current;
    if (!sc || !stage) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const ch = (e.target as HTMLElement).dataset.chapter as Chapter;
          setChapter(ch);
          view.chapter = ch;
          setMode(CHAPTER_MODE[ch]);
        }
      },
      // The chapter crossing the middle of the screen is the one on stage (sections differ in height).
      { root: sc, rootMargin: "-50% 0px -50% 0px" },
    );
    sc.querySelectorAll("[data-chapter]").forEach((el) => io.observe(el));
    const jump = () => (view.p = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight));
    // The 3D camera does its own damping; native progress also tracks touch and programmatic scrolling.
    sc.addEventListener("scroll", jump, { passive: true });
    jump();
    if (!motion) {
      return () => {
        io.disconnect();
        sc.removeEventListener("scroll", jump);
      };
    }

    const anims: JSAnimation[] = [];
    // The headline drifts up and away as soon as scrolling starts.
    const hero = sc.querySelector<HTMLElement>("[data-hero]")!;
    anims.push(
      animate(hero, {
        opacity: [1, 0],
        translateY: [0, -90],
        ease: "linear",
        autoplay: onScroll({
          container: sc,
          target: hero.closest("section")!,
          enter: { target: "top", container: "top" },
          leave: { target: "center", container: "top" },
          sync: 0.25,
        }),
      }),
    );
    // The worlds ring spins as you scroll through its chapter.
    const ring = sc.querySelector<HTMLElement>(".worlds-ring");
    if (ring)
      anims.push(
        animate(ring, {
          rotateY: [40, -300],
          ease: "linear",
          autoplay: onScroll({ container: sc, target: ring.closest("section")!, enter: { target: "top", container: "bottom" }, leave: { target: "bottom", container: "top" }, sync: 0.2 }),
        }),
      );
    return () => {
      io.disconnect();
      sc.removeEventListener("scroll", jump);
      anims.forEach((a) => a.revert());
    };
  }, [motion]);

  // The input bar cycles example questions, like the studio's.
  useEffect(() => {
    if (prompt) return;
    const t = setInterval(() => setHint((h) => h + 1), 3200);
    return () => clearInterval(t);
  }, [prompt]);

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

  const submitPrompt = (text = prompt) => {
    const clean = text.trim();
    if (!clean) return;
    enter(formRef.current, () => {
      useSim.getState().set({ draft: "", lessonSuggestions: [] });
      void ask(clean);
    });
  };

  const simuQuote =
    mode === "projectile"
      ? angleDeg === 45
        ? `45° is the sweet spot. That's the farthest throw you can get at this speed, ${proj.range.toFixed(2)} m.`
        : angleDeg > 55
          ? `That's a high lob. It peaks at ${proj.maxHeight.toFixed(2)} m and lands ${proj.range.toFixed(2)} m away.`
          : `At ${angleDeg}° the ball lands ${proj.range.toFixed(2)} m away after ${proj.flightTime.toFixed(2)} s. Try the sliders.`
      : mode === "gravity"
        ? gPreset.quote
        : molPreset.quote;

  const hintText = STARTERS[hint % STARTERS.length];
  const goTo = (ch: Chapter) => scrollerRef.current?.querySelector(`[data-chapter="${ch}"]`)?.scrollIntoView({ behavior: motion ? "smooth" : "auto" });
  const tryIt = (
    <StudioLink
      enter={enter}
      before={() =>
        applyHookToStudio(
          mode === "projectile" ? { mode: "projectile", angleDeg, speed } : mode === "gravity" ? { mode: "gravity", g: gPreset.g } : { mode: "molecule", formula: molId },
        )
      }
      className="btn btn-accent mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full px-5 text-[15px] font-extrabold"
    >
      Try this in 3D <ArrowRight size={17} strokeWidth={2.5} />
    </StudioLink>
  );

  const cards: Record<Exclude<Chapter, "hero">, React.ReactNode> = {
    projectile: (
      <>
        <CardHead />
        <h2 className="text-[22px] font-extrabold leading-tight">Throw something and see the real numbers.</h2>
        <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">{simuQuote}</p>
        <div className="group-rows mt-3 grid grid-cols-3 text-center [&>*+*]:border-l [&>*+*]:border-t-0 [&>*+*]:border-[var(--hairline)]">
          <Stat label="Lands at" value={`${proj.range.toFixed(2)} m`} />
          <Stat label="Peak" value={`${proj.maxHeight.toFixed(2)} m`} />
          <Stat label="Flight" value={`${proj.flightTime.toFixed(2)} s`} />
        </div>
        <div className="mt-3 space-y-2 px-0.5">
          <label className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
            <span className="w-11">Angle</span>
            <input
              type="range"
              className="slider"
              min={15}
              max={75}
              value={angleDeg}
              style={{ ["--fill" as string]: `${((angleDeg - 15) / 60) * 100}%` }}
              onChange={(e) => setAngleDeg(Number(e.target.value))}
            />
            <span className="w-10 whitespace-nowrap text-right tabular-nums text-ink">{angleDeg}°</span>
          </label>
          <label className="flex items-center gap-2 text-[13px] font-bold text-ink-2">
            <span className="w-11">Speed</span>
            <input
              type="range"
              className="slider"
              min={5}
              max={14}
              value={speed}
              style={{ ["--fill" as string]: `${((speed - 5) / 9) * 100}%` }}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
            <span className="w-14 whitespace-nowrap text-right tabular-nums text-ink">{speed} m/s</span>
          </label>
        </div>
        {tryIt}
      </>
    ),
    gravity: (
      <>
        <CardHead />
        <h2 className="text-[22px] font-extrabold leading-tight">Turn gravity off, or crank it way up.</h2>
        <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">{gPreset.quote}</p>
        <div className="mt-3">
          <Segmented label="Gravity preset" value={gIndex} options={GRAVITY_PRESETS.map((p, i) => [i, p.label] as const)} onChange={setGIndex} />
        </div>
        <p className="mt-2 text-center text-[12.5px] font-bold text-ink-3">g = {gPreset.hint}</p>
        {tryIt}
      </>
    ),
    molecule: (
      <>
        <CardHead label="Verified geometry" dot="var(--dot-info)" />
        <h2 className="text-[22px] font-extrabold leading-tight">See why molecules have the shapes they do.</h2>
        <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">{molPreset.quote}</p>
        <div className="mt-3">
          <Segmented label="Molecule preset" value={molId} options={MOLECULE_PRESETS.map((m) => [m.id, MOLECULES[m.id].formula] as const)} onChange={setMolId} />
        </div>
        <p className="mt-2 text-center text-[12.5px] font-bold text-ink-3">
          {molData.name} · {molPreset.angle}
        </p>
        {tryIt}
      </>
    ),
    worlds: (
      <>
        <CardHead label={`${WORLD_ITEMS.length} worlds`} dot="var(--accent)" />
        <h2 className="text-[22px] font-extrabold leading-tight">Pick from {WORLD_ITEMS.length} little worlds.</h2>
        <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">Scroll to spin through them and tap one to jump in. Or just ask, and Simu picks the right one for you.</p>
        <div className="mt-4 flex items-center justify-center gap-3 text-[12px] font-semibold text-ink-3">
          <Link href="/credits" className="hover:text-ink">
            About
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
        </div>
      </>
    ),
  };

  return (
    <div ref={pageRef} className="relative h-dvh w-full origin-center overflow-hidden">
      {/* The stage: a real 3D diorama behind everything, like the studio's world */}
      <div className="pointer-events-none fixed inset-0">
        <div ref={stageRef} className="h-full w-full">
          <LandingStage mode={mode} angleDeg={angleDeg} speed={speed} g={gPreset.g} molId={molId} motion={motion} />
        </div>
      </div>

      {/* Header: logo, saved experiments, sign-in and the way in */}
      <header
        data-enter
        className="fixed inset-x-0 top-0 z-30 mx-auto flex w-full max-w-[1180px] items-center justify-between gap-2 px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:pt-5"
      >
        <Link href="/" aria-label="SimuBox home" className="btn shrink-0 rounded-[14px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- small local logo */}
          <img src="/branding/simubox-wordmark.webp" alt="SimuBox" width={720} height={279} className="h-10 w-auto sm:h-[52px]" />
        </Link>

        <div className="relative flex items-center gap-1.5 sm:gap-2">
          {user ? (
            <>
              <span className="liquid relative hidden items-center gap-2 rounded-full py-1 pl-1 pr-3 lg:flex" title={user.email ?? undefined}>
                <span className="grid h-8 w-8 overflow-hidden rounded-full bg-[var(--fill)] text-ink-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny */}
                  {user.photo ? <img src={user.photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={15} className="m-auto" />}
                </span>
                <span className="max-w-[140px] truncate text-[13px] font-bold text-ink">{firstName ?? user.email}</span>
              </span>
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="liquid btn relative grid h-10 w-10 place-items-center rounded-full text-ink-2"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : available || !ready ? (
            <button
              type="button"
              onClick={() => void signIn()}
              className="btn btn-ink inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold"
            >
              <LogIn size={15} />
              <span className="sm:hidden">Sign in</span>
              <span className="hidden sm:inline">Sign in with Google</span>
            </button>
          ) : null}
        </div>
      </header>

      {/* The leader line from a card to its demo (drawn by the 3D stage each frame) */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 z-[5] h-full w-full">
        <path ref={(e) => void (view.leader = e)} fill="none" stroke="rgba(31,41,55,.4)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" style={{ opacity: 0 }} />
        <circle ref={(e) => void (view.dot = e)} r="5" fill="#ffc531" stroke="#fff" strokeWidth="2.5" className="leader-dot" style={{ opacity: 0 }} />
      </svg>
      <LiquidFilter />

      {/* Chapter dots, like a page indicator */}
      <nav aria-label="Sections" className="fixed right-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-2 lg:flex">
        {CHAPTERS.map((c) => (
          <button key={c.id} type="button" aria-label={c.label} aria-current={chapter === c.id} onClick={() => goTo(c.id)} className="btn grid h-5 w-5 place-items-center">
            <span
              className={`block w-[7px] rounded-full bg-[var(--ink)] transition-all duration-500 [transition-timing-function:var(--spring)] ${chapter === c.id ? "h-6 opacity-90" : "h-[7px] opacity-25"}`}
            />
          </button>
        ))}
      </nav>

      {/* The story scrolls over the stage */}
      <main ref={scrollerRef} className="no-scrollbar relative z-10 h-dvh overflow-y-auto overscroll-contain">
        <div>
          <section data-chapter="hero" className="flex min-h-dvh flex-col items-center px-4 pt-[16vh] text-center sm:pt-[19vh]">
            <div data-hero>
              {user && (
                <p data-enter className="mb-1 text-[14px] font-extrabold text-[var(--dot-question)]">
                  {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
                </p>
              )}
              <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[58px]" aria-label="Ask anything. Watch it come to life.">
                {"Ask anything. Watch it come to life.".split(" ").map((w, i) => (
                  <span key={i} aria-hidden className="hero-word inline-block">
                    {w}&nbsp;
                  </span>
                ))}
              </h1>
              <p data-enter className="mx-auto mt-3 max-w-[480px] text-[16px] font-semibold leading-relaxed text-ink-2 sm:text-[18px]">
                Ask a science question and Simu turns it into a little 3D world you can actually play with.
              </p>
              {saves && saves.length > 0 && (
                <div data-enter className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[12px] font-bold text-ink-3">Pick up where you left off:</span>
                  {saves.slice(0, 3).map((e) => (
                    <StudioLink
                      key={e.id}
                      enter={enter}
                      before={() => {
                        cancelPlayback();
                        restoreExperiment(e);
                      }}
                      className="glass btn inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold text-ink"
                    >
                      <Bookmark size={12} className="text-[var(--dot-question)]" />
                      <span className="max-w-[160px] truncate">{e.title}</span>
                    </StudioLink>
                  ))}
                </div>
              )}
              <button
                type="button"
                data-enter
                onClick={() => goTo("projectile")}
                className="btn mx-auto mt-6 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold text-ink-3 hover:text-ink"
              >
                See Simu in action <ChevronDown size={16} className="scroll-cue" />
              </button>
            </div>
          </section>




          {(["projectile", "gravity", "molecule"] as const).map((c) => (
            <section key={c} data-chapter={c} className="min-h-dvh" />
          ))}

          <section data-chapter="worlds" className="relative h-[230dvh]">
            <div className="sticky top-0 flex h-dvh items-start justify-center overflow-hidden pt-[13dvh] [perspective:1500px] sm:items-center sm:pl-[400px] sm:pt-0">
              <div className={motion ? "[transform:translateZ(calc(var(--r)*-1))] [transform-style:preserve-3d] [--r:330px] sm:[--r:440px]" : "contents"}>
                <div
                  className={
                    motion
                      ? "worlds-ring relative h-[150px] w-[190px] [transform-style:preserve-3d] sm:h-[200px] sm:w-[250px]"
                      : "grid max-w-[640px] grid-cols-2 gap-2 px-3 sm:grid-cols-3"
                  }
                >
                  {WORLD_ITEMS.map((w, i) => {
                    const Icon = w.icon;
                    return (
                      <StudioLink
                        key={w.id}
                        enter={enter}
                        before={() => openWorld(w.id)}
                        title={w.hint}
                        className={`world-tile liquid btn flex flex-col overflow-hidden rounded-[20px] p-1.5 ${motion ? "absolute inset-0 [backface-visibility:hidden]" : "relative h-[150px]"}`}
                        style={motion ? { transform: `rotateY(${(i * 360) / WORLD_ITEMS.length}deg) translateZ(var(--r))` } : undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- local snapshot */}
                        <img src={`/worlds/${w.id}.webp`} alt="" width={720} height={480} loading="lazy" className="min-h-0 w-full flex-1 rounded-[14px] object-cover" />
                        <span className="flex items-center gap-1.5 px-1.5 pb-0.5 pt-1.5 text-[13px] font-bold text-ink">
                          <Icon size={14} className="shrink-0 text-ink-2" />
                          <span className="truncate">{w.name}</span>
                        </span>
                      </StudioLink>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* One glass card for every chapter: it morphs between them and its content
          dissolves through a blur, like the studio's panels. */}
      <MorphPanel
        contentKey={chapter === "hero" ? null : chapter}
        width={phone ? Math.min(400, vp.w - 24) : 360}
        center={!phone}
        side="left"
        blur={motion}
        surface="liquid landing-card rounded-[24px]"
        area={phone ? "left-1/2 -translate-x-1/2 w-[min(400px,calc(100vw-24px))] top-[44dvh] bottom-[86px] z-20" : "z-20 top-24 bottom-28 left-[max(24px,calc((100vw-1180px)/2))] w-[360px]"}
      >
        <div className="p-4">{chapter !== "hero" && cards[chapter]}</div>
      </MorphPanel>

      {/* The input bar stays at the bottom, like in the studio */}
      <div className="fixed inset-x-0 bottom-[max(14px,env(safe-area-inset-bottom))] z-30 mx-auto w-[min(680px,calc(100vw-24px))] sm:bottom-6">
        <form
          ref={formRef}
          data-enter
          className="liquid relative flex items-center gap-2 rounded-[28px] p-1.5 pl-4"
          onSubmit={(e) => {
            e.preventDefault();
            submitPrompt();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <AnimatePresence initial={false} mode="wait">
              {!prompt && (
                <m.span
                  key={hint}
                  aria-hidden
                  initial={motion ? { opacity: 0, y: 10, filter: "blur(4px)" } : false}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={motion ? { opacity: 0, y: -10, filter: "blur(4px)", transition: { duration: 0.22 } } : { opacity: 0, transition: { duration: 0 } }}
                  transition={springs.smooth}
                  className="pointer-events-none absolute inset-0 truncate py-2 text-[15px] font-semibold leading-[22px] text-ink-3 sm:text-[16px]"
                >
                  {hintText}
                </m.span>
              )}
            </AnimatePresence>
            <input
              type="text"
              value={prompt}
              maxLength={LIMITS.maxPromptChars}
              aria-label="Ask SimuBox anything to simulate"
              title="Press Tab to use the example"
              className="relative w-full bg-transparent py-2 text-[15px] font-semibold leading-[22px] text-ink outline-none sm:text-[16px]"
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Tab" && !e.shiftKey && !prompt) {
                  e.preventDefault();
                  setPrompt(hintText);
                }
              }}
            />
          </div>
          <StudioLink
            enter={enter}
            before={resetToNewExperiment}
            title="Start a blank experiment"
            className="btn btn-quiet hidden h-10 items-center gap-1 rounded-full px-3 text-[13px] font-bold text-ink-2 sm:inline-flex"
          >
            <Plus size={15} /> New
          </StudioLink>
          <button type="submit" disabled={!prompt.trim()} aria-label="Send" className="btn btn-accent grid h-10 w-10 shrink-0 place-items-center rounded-full">
            <ArrowUp size={20} strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>
  );
}

type Chapter = "hero" | "projectile" | "gravity" | "molecule" | "worlds";
const CHAPTER_MODE: Record<Chapter, "projectile" | "gravity" | "molecule"> = {
  hero: "projectile",
  projectile: "projectile",
  gravity: "gravity",
  molecule: "molecule",
  worlds: "projectile",
};
const CHAPTERS: { id: Chapter; label: string }[] = [
  { id: "hero", label: "Top" },
  { id: "projectile", label: "Throw a ball" },
  { id: "gravity", label: "Flip gravity" },
  { id: "molecule", label: "Molecules" },
  { id: "worlds", label: "Worlds" },
];

// Displacement map: neutral grey in the middle, ramps at the rim, so only the
// edges of the glass bend what is behind them, like a thick lens.
const LIQUID_MAP =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="r" x1="0" x2="1"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#000"/></linearGradient><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#0f0"/><stop offset="1" stop-color="#000"/></linearGradient><filter id="b"><feGaussianBlur stdDeviation="4"/></filter></defs><rect width="100" height="100" fill="url(#r)"/><rect width="100" height="100" fill="url(#g)" style="mix-blend-mode:screen"/><rect x="9" y="9" width="82" height="82" rx="14" fill="#808000" filter="url(#b)"/></svg>`,
  );

/** The SVG filter `.liquid` uses for refraction (Chromium only; others get frosted glass). */
function LiquidFilter() {
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Chrome\//.test(ua) && !/Firefox|FxiOS/.test(ua)) document.documentElement.dataset.liquid = "";
  }, []);
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <filter id="liquid-glass" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feImage href={LIQUID_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="0.06" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

/** The small "Simu · label" line that heads each card, like Simu's answer card. */
function CardHead({ label, dot }: { label?: string; dot?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- small local mark */}
      <img src="/branding/simubox-mark.webp" alt="" width={26} height={26} className="h-[26px] w-[26px]" />
      <span className="text-[15px] font-extrabold">Simu</span>
      {label && (
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: dot }} />
          {label}
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2">
      <p className="text-[11.5px] font-bold text-ink-3">{label}</p>
      <p className="text-[15px] font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * A link into the studio that plays the entrance (grow into the veil) instead
 * of jumping. Modified clicks (new tab and so on) keep normal link behaviour.
 */
function StudioLink({
  enter,
  before,
  children,
  className,
  title,
  ...rest
}: {
  enter: (from: HTMLElement | null, before?: () => void) => void;
  before?: () => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href="/app"
      className={className}
      title={title}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          before?.();
          return;
        }
        e.preventDefault();
        enter(e.currentTarget, before);
      }}
    >
      {children}
    </Link>
  );
}
