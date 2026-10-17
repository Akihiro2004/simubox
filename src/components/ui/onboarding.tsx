"use client";

// First sign-in welcome: one glass card over the softly blurred world that
// morphs through five short steps. Every motion is choreographed with
// anime.js inside a per-step scope, so leaving a step reverts its animations.

import { animate, createDrawable, createScope, createTimeline, spring, stagger, steps, type Scope } from "animejs";
import { ArrowRight, Backpack, Check, Globe, GraduationCap, Sprout, VolumeX } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/firebase";
import { useSim, type Settings } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { markOnboarded, needsOnboarding, type OnboardingPrefs } from "@/lib/onboarding";
import { ask } from "@/lib/ask";
import { speak, stopSpeaking } from "@/lib/tts";

/** Step headings take focus (so screen readers announce each step) but never show a ring. */
const noRing = { outline: "none", boxShadow: "none" } as const;

/** Springs shared by the whole flow: a soft settle and a lively pop. */
const settle = () => spring({ bounce: 0.18, duration: 620 });
const pop = () => spring({ bounce: 0.42, duration: 560 });

const STEPS = ["welcome", "how", "level", "voice", "start"] as const;

/** First questions that suit each school level. */
const STARTERS: Record<Settings["gradeBand"], string[]> = {
  elementary: ["What happens if gravity disappears in my room?", "Why does ice float on water?", "What is inside an animal cell?"],
  middle: ["Throw a basketball at 40° and 20 km/h", "Why is a water molecule bent?", "How does a series circuit work?"],
  high: ["What if Earth and Neptune switched places?", "Graph y = x^2 - 3 and explain its shape", "Why are noble gases so unreactive?"],
};

// ---------- when to show it ----------

const noop = () => () => {};
/** `?onboarding=1` opens it on demand (testing and demos). */
const forcedByUrl = () => new URLSearchParams(window.location.search).has("onboarding");

export function Onboarding() {
  const user = useAuth((a) => a.user);
  const forced = useSyncExternalStore(noop, forcedByUrl, () => false);
  const [due, setDue] = useState<string | null>(null);
  // Closed per account, so a second new student on this device still gets it.
  const who = user?.uid ?? "guest";
  const [closedFor, setClosedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    void needsOnboarding(user.uid).then((need) => {
      if (alive && need) {
        // Let the sign-in card step aside for the welcome.
        useSim.getState().set({ accountOpen: false, settingsOpen: false, menuOpen: false, transcriptOpen: false });
        setDue(user.uid);
      }
    });
    return () => {
      alive = false;
    };
  }, [user]);

  const open = closedFor !== who && (forced || (user !== null && due === user.uid));
  if (!open) return null;
  const firstName = user?.name?.split(/\s+/)[0] ?? null;
  return (
    <Flow
      name={firstName}
      onDone={(prefs, question) => {
        useSim.getState().updateSettings(prefs);
        if (user) void markOnboarded(user.uid, prefs);
        setClosedFor(who);
        // A question held back by the sign-in card goes now, unless they picked a starter.
        const held = useSim.getState().pendingQuestion;
        useSim.getState().set({ pendingQuestion: null });
        const next = question ?? held;
        if (next) void ask(next);
      }}
    />
  );
}

// ---------- the flow ----------

function Flow({ name, onDone }: { name: string | null; onDone: (prefs: OnboardingPrefs, question?: string) => void }) {
  const motion = useMotion();
  const settings = useSim((s) => s.settings);
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState<OnboardingPrefs>({ gradeBand: settings.gradeBand, language: settings.language, voice: settings.voice });
  const veil = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const dots = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const fromHeight = useRef<number | null>(null);
  const titleId = `onboarding-title-${STEPS[step]}`;

  // Arrival: the veil fades in, the card rises and settles.
  useLayoutEffect(() => {
    if (!motion) return;
    animate(veil.current!, { opacity: [0, 1], duration: 420, ease: "out(3)" });
    animate(card.current!, { opacity: [0, 1], translateY: [36, 0], scale: [0.94, 1], ease: settle() });
  }, [motion]);

  // Each step: the card springs to its new height while the content cascades in.
  useLayoutEffect(() => {
    const el = card.current!;
    const from = fromHeight.current;
    fromHeight.current = null;
    if (motion && from !== null) {
      const to = el.offsetHeight;
      el.style.height = `${from}px`;
      animate(el, {
        height: to,
        ease: settle(),
        onComplete: () => {
          el.style.height = "";
        },
      });
    }
    const items = body.current!.querySelectorAll("[data-in]");
    if (motion)
      animate(items, {
        translateY: { from: 14, to: 0, ease: settle() },
        opacity: { from: 0, to: 1, duration: 380, ease: "out(3)" },
        filter: { from: "blur(6px)", to: "blur(0px)", duration: 420, ease: "out(3)" },
        delay: stagger(55, { start: 60 }),
      });
    // The active page dot stretches into a pill.
    dots.current!.querySelectorAll("span").forEach((d, i) => {
      const on = i === step;
      if (motion) animate(d, { width: on ? 22 : 7, opacity: on ? 1 : i < step ? 0.55 : 0.28, ease: settle() });
      else Object.assign(d.style, { width: `${on ? 22 : 7}px`, opacity: String(on ? 1 : i < step ? 0.55 : 0.28) });
    });
    // Move focus to the new step's heading for keyboard and screen-reader users.
    document.getElementById(`onboarding-title-${STEPS[step]}`)?.focus({ preventScroll: true });
  }, [step, motion]);

  const go = useCallback(
    (next: number) => {
      if (busy.current || next < 0 || next >= STEPS.length) return;
      busy.current = true;
      stopSpeaking();
      fromHeight.current = card.current!.offsetHeight;
      const done = () => {
        busy.current = false;
        setStep(next);
      };
      if (!motion) return done();
      const dir = next > step ? -1 : 1;
      animate(body.current!.querySelectorAll("[data-in]"), {
        opacity: 0,
        translateX: dir * 18,
        filter: "blur(6px)",
        duration: 170,
        delay: stagger(18),
        ease: "in(2)",
        onComplete: done,
      });
    },
    [motion, step],
  );

  const finish = useCallback(
    (question?: string, from?: HTMLElement) => {
      if (busy.current) return;
      busy.current = true;
      stopSpeaking();
      if (!motion) return onDone(prefs, question);
      // A little burst from what was tapped, then the card drops toward the composer and the veil lifts.
      if (from) burst(from);
      createTimeline({ onComplete: () => onDone(prefs, question) })
        .add(card.current!, { scale: 0.96, translateY: 40, opacity: 0, filter: "blur(10px)", duration: 420, ease: "in(3)" }, 120)
        .add(veil.current!, { opacity: 0, duration: 380, ease: "out(2)" }, 260);
    },
    [motion, onDone, prefs],
  );

  // Keyboard: Escape skips, arrows move, Tab stays inside the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" && step < STEPS.length - 1 && !(e.target instanceof HTMLInputElement)) go(step + 1);
      else if (e.key === "ArrowLeft" && step > 0) go(step - 1);
      else if (e.key === "Tab") {
        const f = [...card.current!.querySelectorAll<HTMLElement>("button:not(:disabled)")];
        if (!f.length) return;
        const [first, last] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, go, step]);

  const s = STEPS[step];
  return (
    <div ref={veil} className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-[rgba(232,236,241,0.5)] px-3 py-4 backdrop-blur-[14px]">
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby={titleId} className="glass relative w-[min(460px,100%)] overflow-hidden rounded-[30px]">
        <div className="flex h-14 items-center justify-between px-4">
          <div ref={dots} className="flex items-center gap-1.5 pl-1" aria-label={`Step ${step + 1} of ${STEPS.length}`} role="img">
            {STEPS.map((k) => (
              <span key={k} className="block h-[7px] w-[7px] rounded-full bg-[var(--ink)] opacity-30" />
            ))}
          </div>
          {s !== "start" && (
            <button type="button" className="btn btn-quiet rounded-full px-3 py-1.5 text-[14px] font-bold text-ink-2" onClick={() => finish()}>
              Skip
            </button>
          )}
        </div>
        <div ref={body} className="px-6 pb-2" key={s}>
          {s === "welcome" && <Welcome name={name} motion={motion} />}
          {s === "how" && <HowItWorks motion={motion} />}
          {s === "level" && <Level value={prefs.gradeBand} onChange={(gradeBand) => setPrefs({ ...prefs, gradeBand })} motion={motion} />}
          {s === "voice" && <Voice prefs={prefs} onChange={setPrefs} motion={motion} />}
          {s === "start" && <Start level={prefs.gradeBand} onPick={(q, el) => finish(q, el)} />}
        </div>
        <div className="flex items-center gap-2 px-4 pb-4 pt-3">
          {step > 0 ? (
            <button type="button" className="btn btn-quiet h-12 rounded-full px-5 text-[15px] font-bold text-ink-2" onClick={() => go(step - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          {s === "start" ? (
            <button key="explore" type="button" className="btn btn-quiet ml-auto h-12 rounded-full px-5 text-[15px] font-bold text-ink-2" onClick={(e) => finish(undefined, e.currentTarget)}>
              I&apos;ll explore on my own
            </button>
          ) : (
            <button key="next" type="button" className="btn btn-accent ml-auto flex h-12 items-center gap-2 rounded-full pl-6 pr-5 text-[16px] font-extrabold" onClick={() => go(step + 1)}>
              {step === 0 ? "Let's go" : "Continue"} <ArrowRight size={18} strokeWidth={2.6} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Splits a title into letters (rendered by React, so nothing fights the DOM). */
function Letters({ text }: { text: string }) {
  return (
    <span aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="inline-block whitespace-nowrap">
          {[...w].map((ch, j) => (
            <span key={j} className="ob-ch inline-block">
              {ch}
            </span>
          ))}
          {" "}
        </span>
      ))}
    </span>
  );
}

/** Runs a step's own animations in a scope that reverts when the step leaves. */
function useScene(motion: boolean, build: (root: HTMLElement) => void) {
  const root = useRef<HTMLDivElement>(null);
  const keep = useRef(build);
  useEffect(() => {
    if (!motion || !root.current) return;
    const el = root.current;
    const scope: Scope = createScope({ root: el }).add(() => keep.current(el));
    return () => void scope.revert();
  }, [motion]);
  return root;
}

// ---------- step 1: welcome ----------

function Welcome({ name, motion }: { name: string | null; motion: boolean }) {
  const root = useScene(motion, (el) => {
    const q = (s: string) => el.querySelector(s)!;
    createTimeline()
      .add(q(".ob-glow"), { scale: [0.4, 1], opacity: [0, 1], duration: 900, ease: "out(3)" }, 0)
      .add(q(".ob-simu"), { scale: [0.2, 1], rotate: [-14, 0], ease: pop() }, 80)
      .add(q(".ob-antenna"), { rotate: [-18, 10, 0], duration: 700, ease: "out(3)" }, 380)
      .add(
        el.querySelectorAll(".ob-ch"),
        {
          translateY: { from: 22, to: 0, ease: pop() },
          rotate: { from: 8, to: 0, ease: pop() },
          opacity: { from: 0, to: 1, duration: 260, ease: "out(2)" },
          filter: { from: "blur(4px)", to: "blur(0px)", duration: 320, ease: "out(2)" },
          delay: stagger(22),
        },
        260,
      )
      .add(q(".ob-sub"), { opacity: [0, 1], translateY: [10, 0], ease: settle() }, 650);
    // Alive: a gentle float, and a blink every few seconds.
    animate(q(".ob-simu"), { translateY: [-3, 3], duration: 2200, ease: "inOutSine", loop: true, alternate: true, delay: 1100 });
    animate(el.querySelectorAll(".ob-eye"), { scaleY: [1, 0.1, 1], duration: 220, delay: 2400, loopDelay: 3200, loop: true, ease: "inOutQuad" });
    animate(q(".ob-glow"), { scale: [1, 1.08], opacity: [0.85, 1], duration: 2600, ease: "inOutSine", loop: true, alternate: true, delay: 900 });
  });
  return (
    <div ref={root} className="flex flex-col items-center pb-3 pt-2 text-center">
      <div data-in className="relative mb-5 grid h-[148px] w-[148px] place-items-center">
        <div className="ob-glow absolute inset-0 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,197,49,.55) 0%, rgba(255,197,49,.18) 45%, transparent 70%)" }} />
        <SimuHead className="ob-simu relative" />
      </div>
      <h2 id="onboarding-title-welcome" tabIndex={-1} style={noRing} className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.01em] outline-none">
        <Letters text={name ? `Hi ${name}, I'm Simu.` : "Hi, I'm Simu."} />
      </h2>
      <p className="ob-sub mt-3 max-w-[330px] text-[16px] font-semibold leading-relaxed text-ink-2">Ask me anything about science and I&apos;ll build it for you in 3D, then you can play with it.</p>
    </div>
  );
}

/** Simu's head, drawn for the welcome: visor, cyan eyes and the antenna ball. */
function SimuHead({ className = "" }: { className?: string }) {
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" className={className} aria-hidden style={{ overflow: "visible" }}>
      <g className="ob-antenna" style={{ transformOrigin: "56px 26px" }}>
        <line x1="56" y1="26" x2="56" y2="10" stroke="#cfd6df" strokeWidth="4" strokeLinecap="round" />
        <circle cx="56" cy="8" r="6" fill="#4fd1e8" />
      </g>
      <rect x="10" y="24" width="92" height="76" rx="30" fill="#fff" stroke="rgba(17,24,39,.08)" strokeWidth="1.5" />
      <rect x="22" y="42" width="68" height="40" rx="20" fill="#16203d" />
      <rect className="ob-eye" x="38" y="51" width="11" height="20" rx="5.5" fill="#67e8f9" style={{ transformOrigin: "43.5px 61px" }} />
      <rect className="ob-eye" x="63" y="51" width="11" height="20" rx="5.5" fill="#67e8f9" style={{ transformOrigin: "68.5px 61px" }} />
      <rect x="4" y="52" width="8" height="22" rx="4" fill="#4fd1e8" />
      <rect x="100" y="52" width="8" height="22" rx="4" fill="#4fd1e8" />
    </svg>
  );
}

// ---------- step 2: how it works ----------

function HowItWorks({ motion }: { motion: boolean }) {
  const root = useScene(motion, (el) => {
    const q = (s: string) => el.querySelector(s)!;
    const all = (s: string) => el.querySelectorAll(s);
    createTimeline({ delay: 380 })
      // Ask: the question types itself, then the send button bumps.
      .add(all(".ob-type"), { opacity: [0, 1], duration: 1, delay: stagger(34) }, 0)
      .add(q(".ob-send"), { scale: [1, 1.25, 1], duration: 360, ease: "out(3)" }, ">")
      // Watch: blocks drop into the little world and bounce.
      .add(all(".ob-block"), { translateY: [-26, 0], opacity: [0, 1], delay: stagger(110), ease: pop() }, "<<+=120")
      .add(q(".ob-planet"), { scale: [0, 1], ease: pop() }, "<<+=200")
      // Play: the cursor reaches for the ball and flicks it.
      .add(q(".ob-cursor"), { translateX: [26, 0], translateY: [18, 0], opacity: [0, 1], duration: 520, ease: "out(3)" }, "<<+=160")
      .add(q(".ob-cursor"), { scale: [1, 0.85, 1], duration: 260, ease: "inOut(2)" })
      .add(q(".ob-ball"), { translateX: [0, 34], translateY: [0, -18, 0], duration: 760, ease: "out(2)" }, "<<+=80")
      .add(q(".ob-ball"), { translateY: [0, -6, 0], duration: 320, ease: "out(2)" });
    animate(q(".ob-caret"), { opacity: [1, 0], duration: 520, loop: true, alternate: true, ease: steps(1) });
    animate(q(".ob-orbit"), { rotate: 360, duration: 6000, loop: true, ease: "linear" });
  });
  const question = "Why is the sky blue?";
  return (
    <div ref={root} className="pb-2 pt-1">
      <h2 id="onboarding-title-how" tabIndex={-1} style={noRing} data-in className="mb-1 text-[24px] font-extrabold leading-tight outline-none">
        How it works
      </h2>
      <p data-in className="mb-4 text-[15px] font-semibold text-ink-2">
        Three steps, and every lesson is yours to change.
      </p>
      <div className="group-rows overflow-hidden">
        <Row n="1" title="Ask" text="Type any question, the way you'd ask a friend.">
          <div className="flex h-9 w-[168px] items-center gap-1 rounded-full bg-white pl-3 pr-1.5 shadow-[0_0_0_0.5px_rgba(17,24,39,.1)]">
            <span className="min-w-0 flex-1 whitespace-nowrap text-[11.5px] font-bold">
              {[...question].map((c, i) => (
                <span key={i} className={motion ? "ob-type opacity-0" : "ob-type"}>
                  {c}
                </span>
              ))}
              <span className="ob-caret ml-px inline-block h-3 w-px translate-y-0.5 bg-[var(--ink)]" />
            </span>
            <span className="ob-send grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--accent)]">
              <ArrowRight size={13} strokeWidth={3} />
            </span>
          </div>
        </Row>
        <Row n="2" title="Watch" text="Simu builds it in 3D and shows you why.">
          <svg width="124" height="64" viewBox="0 0 124 64" aria-hidden style={{ overflow: "visible" }}>
            <path d="M18 44 L62 22 L106 44 L62 66 Z" fill="#e7d4b6" />
            {[
              [44, 30, "#6b8fe0"],
              [62, 38, "#ffc531"],
              [80, 30, "#5fb38a"],
            ].map(([x, y, c], i) => (
              <g key={i} className="ob-block" style={{ opacity: motion ? 0 : 1 }}>
                <path d={`M${x} ${y} l9 -5 l9 5 l-9 5 z`} fill={String(c)} />
                <path d={`M${x} ${y} l9 5 v10 l-9 -5 z`} fill={String(c)} opacity=".75" />
                <path d={`M${Number(x) + 18} ${y} l-9 5 v10 l9 -5 z`} fill={String(c)} opacity=".55" />
              </g>
            ))}
            <g className="ob-orbit" style={{ transformOrigin: "100px 12px" }}>
              <circle className="ob-planet" cx="112" cy="12" r="5" fill="#4fd1e8" style={{ transformOrigin: "112px 12px" }} />
            </g>
            <circle cx="100" cy="12" r="3.5" fill="#ffc531" />
          </svg>
        </Row>
        <Row n="3" title="Play" text="Drag, throw and tweak. Ask “what if?” any time.">
          <svg width="124" height="56" viewBox="0 0 124 56" aria-hidden style={{ overflow: "visible" }}>
            <path d="M4 50 H120" stroke="rgba(17,24,39,.12)" strokeWidth="2" strokeLinecap="round" />
            <circle className="ob-ball" cx="40" cy="41" r="9" fill="#e5484d" />
            <path className="ob-cursor" d="M50 30 l0 18 l5 -5 l4 9 l3 -1.5 l-4 -9 l7 0 z" fill="#1c1e22" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" style={{ opacity: motion ? 0 : 1, transformOrigin: "50px 30px" }} />
          </svg>
        </Row>
      </div>
    </div>
  );
}

function Row({ n, title, text, children }: { n: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div data-in className="flex items-center gap-3 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[16px] font-extrabold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--fill)] text-[12px] text-ink-2">{n}</span>
          {title}
        </p>
        <p className="mt-0.5 text-[13.5px] font-semibold leading-snug text-ink-2">{text}</p>
      </div>
      <div className="grid shrink-0 place-items-center">{children}</div>
    </div>
  );
}

// ---------- step 3: school level ----------

const LEVELS: { id: Settings["gradeBand"]; title: string; hint: string; icon: typeof Sprout }[] = [
  { id: "elementary", title: "Primary school", hint: "Ages 6 to 11. Simple words, lots of playing.", icon: Sprout },
  { id: "middle", title: "Middle school", hint: "Ages 11 to 14. Real numbers and why things happen.", icon: Backpack },
  { id: "high", title: "High school", hint: "Ages 14 to 18. Formulas, graphs and deeper ideas.", icon: GraduationCap },
];

function Level({ value, onChange, motion }: { value: Settings["gradeBand"]; onChange: (v: Settings["gradeBand"]) => void; motion: boolean }) {
  return (
    <div className="pb-2 pt-1">
      <h2 id="onboarding-title-level" tabIndex={-1} style={noRing} data-in className="mb-1 text-[24px] font-extrabold leading-tight outline-none">
        Which school level?
      </h2>
      <p data-in className="mb-4 text-[15px] font-semibold text-ink-2">
        Simu explains things at this level. You can change it later in Settings.
      </p>
      <div role="radiogroup" aria-label="School level" className="flex flex-col gap-2">
        {LEVELS.map((l) => (
          <Choice key={l.id} on={value === l.id} onPick={() => onChange(l.id)} icon={<l.icon size={20} />} title={l.title} hint={l.hint} motion={motion} />
        ))}
      </div>
    </div>
  );
}

/** A big selectable card: springs when picked, and its check mark draws itself. */
function Choice({ on, onPick, icon, title, hint, motion }: { on: boolean; onPick: () => void; icon: React.ReactNode; title: string; hint?: string; motion: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const first = useRef(true);
  useEffect(() => {
    const el = ref.current!;
    const path = el.querySelector<SVGPathElement>(".ob-check-path");
    if (first.current) {
      first.current = false;
      if (path) path.style.strokeDashoffset = on ? "0" : "";
      if (!motion || !on) return;
    }
    if (!motion) return;
    if (on) {
      animate(el, { scale: [0.97, 1], ease: pop() });
      if (path) animate(createDrawable(path), { draw: ["0 0", "0 1"], duration: 420, delay: 80, ease: "out(3)" });
      animate(el.querySelector(".ob-check")!, { scale: [0.4, 1], ease: pop() });
    }
  }, [on, motion]);
  return (
    <button
      ref={ref}
      data-in
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`btn flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left ${on ? "bg-white shadow-[0_0_0_2px_var(--accent),0_10px_24px_-12px_rgba(240,168,0,.55)]" : "bg-white/60 shadow-[0_0_0_0.5px_var(--hairline)] hover:bg-white/85"}`}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] transition-colors duration-300 ${on ? "bg-[var(--accent)] text-ink" : "bg-[var(--fill)] text-ink-2"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-extrabold">{title}</span>
        {hint && <span className="block text-[13px] font-semibold leading-snug text-ink-3">{hint}</span>}
      </span>
      <span className={`ob-check grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-200 ${on ? "bg-[var(--ink)]" : "bg-transparent shadow-[0_0_0_1.5px_var(--fill-2)]"}`}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path className="ob-check-path" d="M3 7.4 L5.8 10 L11 4.4" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" strokeDashoffset={on ? 0 : 1} />
        </svg>
      </span>
    </button>
  );
}

// ---------- step 4: language and voice ----------

const LANGS: { id: Settings["language"]; title: string; hint: string }[] = [
  { id: "en", title: "English", hint: "Simu teaches in English." },
  { id: "id", title: "Bahasa Indonesia", hint: "Simu mengajar dalam Bahasa Indonesia." },
  { id: "auto", title: "Match how I type", hint: "Answers in the language of each question." },
];

function Voice({ prefs, onChange, motion }: { prefs: OnboardingPrefs; onChange: (p: OnboardingPrefs) => void; motion: boolean }) {
  const waves = useRef<SVGGElement>(null);
  const [hearing, setHearing] = useState(false);
  useEffect(() => {
    if (!motion || !prefs.voice || !waves.current) return;
    const a = animate(waves.current.querySelectorAll("path"), { opacity: [0.25, 1, 0.25], duration: 1100, delay: stagger(140), loop: true, ease: "inOutSine" });
    return () => void a.revert();
  }, [motion, prefs.voice]);

  const hear = async () => {
    if (hearing) return;
    setHearing(true);
    const lang = prefs.language === "id" ? "id" : "en";
    const text = lang === "id" ? "Halo! Aku Simu. Ayo kita jelajahi sains bersama!" : "Hi! I'm Simu. Let's explore science together!";
    await speak(text, { lang, rate: 1, pitch: 1.2, role: "robot", signal: new AbortController().signal });
    setHearing(false);
  };

  return (
    <div className="pb-2 pt-1">
      <h2 id="onboarding-title-voice" tabIndex={-1} style={noRing} data-in className="mb-1 text-[24px] font-extrabold leading-tight outline-none">
        Language and voice
      </h2>
      <p data-in className="mb-4 text-[15px] font-semibold text-ink-2">
        Pick how Simu talks to you.
      </p>
      <div role="radiogroup" aria-label="Language" className="flex flex-col gap-2">
        {LANGS.map((l) => (
          <Choice key={l.id} on={prefs.language === l.id} onPick={() => onChange({ ...prefs, language: l.id })} icon={<Globe size={19} />} title={l.title} hint={l.hint} motion={motion} />
        ))}
      </div>
      <div data-in className="group-rows mt-3 flex items-center gap-3 px-3.5 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[var(--fill)] text-ink-2">
          {prefs.voice ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H2v6h4l5 4V5Z" fill="currentColor" />
              <g ref={waves}>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M19 5a10 10 0 0 1 0 14" />
              </g>
            </svg>
          ) : (
            <VolumeX size={20} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold">Read lines aloud</span>
          <span className="block text-[13px] font-semibold text-ink-3">Captions always show, sound or not.</span>
        </span>
        {prefs.voice && (
          <button type="button" className="btn btn-quiet rounded-full bg-[var(--fill)] px-3 py-1.5 text-[13px] font-bold" onClick={() => void hear()} disabled={hearing}>
            {hearing ? "Playing…" : "Hear Simu"}
          </button>
        )}
        <Toggle on={prefs.voice} label="Read lines aloud" onChange={(voice) => onChange({ ...prefs, voice })} />
      </div>
    </div>
  );
}

/** iOS-style switch; the knob springs across with anime.js. */
function Toggle({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  const knob = useRef<HTMLSpanElement>(null);
  const motion = useMotion();
  useEffect(() => {
    if (!knob.current) return;
    if (motion) animate(knob.current, { translateX: on ? 20 : 0, ease: pop() });
    else knob.current.style.transform = `translateX(${on ? 20 : 0}px)`;
  }, [on, motion]);
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`btn relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-300 ${on ? "bg-[#30a46c]" : "bg-[var(--fill-2)]"}`}>
      <span ref={knob} className="absolute left-[2px] top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,.15),0_0_0_0.5px_rgba(0,0,0,.04)]" />
    </button>
  );
}

// ---------- step 5: first question ----------

function Start({ level, onPick }: { level: Settings["gradeBand"]; onPick: (q: string, el: HTMLElement) => void }) {
  return (
    <div className="pb-2 pt-1">
      <h2 id="onboarding-title-start" tabIndex={-1} style={noRing} data-in className="mb-1 text-[24px] font-extrabold leading-tight outline-none">
        Try your first question
      </h2>
      <p data-in className="mb-4 text-[15px] font-semibold text-ink-2">
        Pick one and watch it come to life. You can ask anything after.
      </p>
      <div className="group-rows overflow-hidden">
        {STARTERS[level].map((q) => (
          <button key={q} data-in type="button" className="btn group flex w-full items-center gap-3 px-3.5 py-3.5 text-left hover:bg-black/[0.03]" onClick={(e) => onPick(q, e.currentTarget)}>
            <span className="min-w-0 flex-1 text-[15.5px] font-bold leading-snug">{q}</span>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] transition-transform duration-300 [transition-timing-function:var(--spring)] group-hover:translate-x-0.5">
              <ArrowRight size={16} strokeWidth={2.6} />
            </span>
          </button>
        ))}
      </div>
      <p data-in className="mt-3 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-ink-3">
        <Check size={14} /> Your choices are saved to your account.
      </p>
    </div>
  );
}

/** A small burst of accent dots from a tapped control. */
function burst(from: HTMLElement) {
  const r = from.getBoundingClientRect();
  const layer = document.createElement("div");
  layer.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;z-index:70;pointer-events:none`;
  const colors = ["#ffc531", "#4fd1e8", "#5fb38a", "#6b8fe0", "#e5484d"];
  const dotsEls = Array.from({ length: 14 }, (_, i) => {
    const d = document.createElement("span");
    d.style.cssText = `position:absolute;width:8px;height:8px;margin:-4px;border-radius:9px;background:${colors[i % colors.length]}`;
    layer.appendChild(d);
    return d;
  });
  document.body.appendChild(layer);
  dotsEls.forEach((d, i) => {
    const a = (i / dotsEls.length) * Math.PI * 2;
    const dist = 60 + (i % 3) * 18;
    animate(d, { translateX: Math.cos(a) * dist, translateY: Math.sin(a) * dist, scale: [1, 0], duration: 720, ease: "out(3)" });
  });
  setTimeout(() => layer.remove(), 800);
}

