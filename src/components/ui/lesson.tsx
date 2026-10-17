"use client";

import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { MathText } from "./formula";
import { RevealText } from "./kit";
import { useSim } from "@/lib/store";
import { cascade, popover, rise, spring, swap } from "@/lib/motion";
import { answerQuestion, placeholderValues, replay, resolvePlaceholder, skipSpeech } from "@/lib/player";
import { MOLECULES } from "@/lib/engine/chemistry";

/** Tiny Simu face, used wherever the guide "speaks" in the interface. */
export function SimuFace({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={`shrink-0 ${className}`}>
      <rect x="1" y="2" width="26" height="23" rx="10" fill="#fff" stroke="rgba(17,24,39,.1)" />
      <rect x="5" y="8" width="18" height="11" rx="5.5" fill="#16203d" />
      <rect x="8.5" y="11" width="3" height="5" rx="1.5" fill="#67e8f9" />
      <rect x="16.5" y="11" width="3" height="5" rx="1.5" fill="#67e8f9" />
    </svg>
  );
}

/** Opens and closes its content by animating the height, so nothing below jumps. */
function Expand({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="x" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.layout} className="overflow-hidden">
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const pill = "btn btn-quiet flex h-9 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3 text-[14px] font-bold";

/** Is Simu's answer showing in the shared left card right now? */
export function useExplanationShown(desktop: boolean): boolean {
  const has = useSim((s) => Boolean(s.explanation));
  // Step aside while a prediction question is waiting, so the question has the stage.
  const asking = useSim((s) => Boolean(s.question && s.question.picked === null));
  const readingTable = useSim((s) => s.world === "lab" && s.camera.preset === "periodic_table");
  const opened = useSim((s) => s.explanationOpen);
  if (!has || asking) return false;
  // Desktop shows it beside the world; phones and the table view open it from a bar or pill.
  return desktop && !readingTable ? true : opened;
}

/** Simu's answer: lives in the left card that also becomes the menu and the conversation. */
export function ExplanationContent() {
  const ex = useSim((s) => s.explanation);
  const readingTable = useSim((s) => s.world === "lab" && s.camera.preset === "periodic_table");
  const formula = useSim((s) => s.formula);
  const hasPlan = useSim((s) => Boolean(s.lastPlan));
  const set = useSim((s) => s.set);
  const [more, setMore] = useState(false);

  const body = ex && (
    <motion.div variants={cascade.parent} initial="hidden" animate="show">
      <motion.div variants={cascade.child} className="mb-2 flex items-center gap-2">
        <SimuFace />
        <span className="text-[15px] font-extrabold">Simu</span>
        <button className="btn btn-quiet ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-2" aria-label="Hide Simu's answer" onClick={() => set({ explanation: null, explanationOpen: false })}>
          <X size={17} />
        </button>
      </motion.div>
      <motion.h2 variants={cascade.child} className="text-[20px] font-extrabold leading-tight">
        {ex.title}
      </motion.h2>
      <motion.p variants={cascade.child} className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">
        {ex.reply}
      </motion.p>

      <AnimatePresence initial={false}>
        {formula && (
          <motion.div key={formula.formula} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.layout} className="overflow-hidden">
            <div className="group-rows mt-3">
              <div className="px-3.5 pb-2 pt-2.5">
                <p className="text-[13px] font-semibold text-ink-3">{formula.title}</p>
                <p className="mt-1 font-serif text-[21px] font-semibold">
                  <MathText src={formula.formula} />
                </p>
              </div>
              {formula.variables.map((v) => (
                <div key={v.symbol} className="flex items-baseline gap-3 px-3.5 py-2 text-[14px]">
                  <span className="min-w-6 shrink-0 font-serif text-[16px] font-semibold">
                    <MathText src={v.symbol} />
                  </span>
                  <span className="font-semibold text-ink-2">
                    {v.meaning}
                    {v.unit ? `, in ${v.unit}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Expand open={more}>
        <div className="mt-3 space-y-3 text-[14px] font-semibold leading-relaxed text-ink-2">
          {ex.details && <p className="whitespace-pre-line">{ex.details}</p>}
          {ex.assumptions.length > 0 && (
            <div>
              <p className="mb-1 font-extrabold text-ink">What we&apos;re assuming</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {ex.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {ex.limitations.length > 0 && (
            <div>
              <p className="mb-1 font-extrabold text-ink">In real life</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {ex.limitations.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Expand>

      <motion.div variants={cascade.child} className="mt-3 flex flex-wrap gap-1.5">
        {(ex.details || ex.assumptions.length > 0 || ex.limitations.length > 0) && (
          <button className={pill} aria-expanded={more} onClick={() => setMore(!more)}>
            <motion.span animate={{ rotate: more ? 180 : 0 }} transition={spring.snappy} className="grid">
              <ChevronDown size={16} />
            </motion.span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span key={more ? "less" : "more"} {...swap}>
                {more ? "Less" : "Tell me more"}
              </motion.span>
            </AnimatePresence>
          </button>
        )}
        {hasPlan && ex.scope === "in_scope" && (
          <button className={`${pill} group`} onClick={() => void replay()}>
            <RotateCcw size={15} className="transition-transform duration-500 [transition-timing-function:var(--spring)] group-hover:-rotate-[200deg]" /> Watch again
          </button>
        )}
      </motion.div>

      {ex.source === "offline-demo" && <p className="mt-3 text-[12px] font-semibold leading-snug text-ink-3">Offline demo: a pre-written lesson, because the AI isn&apos;t connected on this server.</p>}
    </motion.div>
  );


  return (
    <div className="p-4" aria-live="polite" aria-label="Simu's answer">
      {readingTable && (
        <button className="btn btn-quiet mb-2 text-sm" onClick={() => set({ explanationOpen: false })}>
          Back to the table
        </button>
      )}
      {body}
    </div>
  );
}

/** The periodic table hides the answer behind a pill; it opens the shared left card. */
export function ExplanationCard() {
  const ex = useSim((s) => s.explanation);
  const readingTable = useSim((s) => s.world === "lab" && s.camera.preset === "periodic_table");
  const asking = useSim((s) => Boolean(s.question && s.question.picked === null));
  const panelBusy = useSim((s) => s.explanationOpen || s.menuOpen || s.transcriptOpen);
  const set = useSim((s) => s.set);
  const show = readingTable && Boolean(ex) && !asking && !panelBusy;
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          key="pill"
          {...popover("bottom left", "bottom")}
          className="glass fixed bottom-[100px] left-4 z-20 flex h-11 items-center gap-2 rounded-full px-3 text-sm font-bold sm:bottom-7 sm:left-6"
          whileTap={{ scale: 0.94 }}
          onClick={() => set({ explanationOpen: true, menuOpen: false, transcriptOpen: false })}
        >
          <SimuFace size={24} /> Read explanation
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function NarratorCaption() {
  const speech = useSim((s) => (s.speech?.speaker === "narrator" ? s.speech : null));
  // Character lines show as bubbles in 3D; narrator lines sit above the composer.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-[100px]">
      <AnimatePresence mode="popLayout">
        {speech && (
          <motion.button
            key={speech.key}
            initial={{ opacity: 0, y: 16, scale: 0.9, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(4px)", transition: { duration: 0.16 } }}
            transition={spring.bouncy}
            whileTap={{ scale: 0.97 }}
            className="pointer-events-auto flex max-w-[620px] items-start gap-2.5 rounded-[22px] bg-white px-4 py-3 text-left shadow-[0_10px_28px_-8px_rgba(31,41,55,0.35)]"
            onClick={skipSpeech}
            aria-live="polite"
            aria-label={`Simu says: ${speech.text}. Click to skip.`}
          >
            <SimuFace size={26} />
            <span className="pt-0.5 text-[16px] font-bold leading-snug">
              <RevealText text={speech.text} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

export function QuestionCard() {
  const q = useSim((s) => s.question);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-30 flex justify-center px-3 sm:top-[84px]">
      <AnimatePresence>{q && <Question key={q.question} q={q} />}</AnimatePresence>
    </div>
  );
}

function Question({ q }: { q: NonNullable<ReturnType<typeof useSim.getState>["question"]> }) {
  const done = q.picked !== null;
  const right = q.picked === q.answerIndex;
  return (
    <motion.div {...popover("top center")} className="glass pointer-events-auto w-full max-w-[440px] rounded-[22px] p-4" role="dialog" aria-label="Make a prediction">
      <motion.div variants={cascade.parent} initial="hidden" animate="show">
        <motion.p variants={cascade.child} className="text-[13px] font-semibold text-ink-3">
          Make a guess, then watch
        </motion.p>
        <motion.p variants={cascade.child} className="mb-3 mt-0.5 text-[19px] font-extrabold leading-snug">
          {q.question}
        </motion.p>
        <motion.div variants={cascade.child} className="group-rows">
          {q.choices.map((c, i) => {
            const isAnswer = done && i === q.answerIndex;
            const wrongPick = done && i === q.picked && !right;
            return (
              <motion.button
                key={c}
                disabled={done}
                // The wrong pick gives a little head-shake; the answer pops.
                animate={wrongPick ? { x: [0, -7, 6, -4, 2, 0] } : { x: 0 }}
                transition={{ type: "tween", duration: 0.45, ease: "easeOut" }}
                whileTap={done ? undefined : { scale: 0.98 }}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[15px] font-bold"
                onClick={() => answerQuestion(i)}
              >
                <motion.span
                  animate={isAnswer || wrongPick ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                  // Springs only take two keyframes; a three-step pop needs a timed curve.
                  transition={{ duration: 0.42, times: [0, 0.4, 1], ease: [0.34, 1.56, 0.64, 1] }}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-300 ${isAnswer ? "border-[#30a46c] bg-[#30a46c] text-white" : wrongPick ? "border-[var(--dot-warning)] bg-[var(--dot-warning)] text-white" : "border-[var(--fill-2)]"}`}
                >
                  {isAnswer && <Check size={14} strokeWidth={3} />}
                  {wrongPick && <X size={14} strokeWidth={3} />}
                </motion.span>
                <span className={`transition-colors duration-300 ${done && !isAnswer ? "text-ink-3" : ""}`}>{c}</span>
              </motion.button>
            );
          })}
        </motion.div>
        <Expand open={done}>
          <p className="mt-3 text-[15px] font-semibold leading-relaxed text-ink-2">
            <span className="font-extrabold text-ink">{right ? "You got it. " : "Good guess. "}</span>
            {q.explanation}
          </p>
        </Expand>
        {!done && (
          <motion.button variants={cascade.child} className="mt-2 text-[13px] font-bold text-ink-3 transition-colors hover:text-ink" onClick={() => answerQuestion(q.answerIndex)}>
            Skip and show me
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );
}

const METRIC_LABEL: Record<string, string> = {
  range: "lands at", flight_time: "in the air", max_height: "highest point", impact_speed: "landing speed", gravity: "gravity", bond_angle: "bond angle",
  current: "current", total_resistance: "resistance", power: "power", wave_speed: "wave speed", torque_left: "left turning effect", torque_right: "right turning effect",
  phase: "state", rms_speed: "particle speed", day: "orbit day", season: "season", moon_phase: "Moon", volume: "volume", surface_area: "surface area", float_fraction: "under water",
};
const CLOCK_METRICS = ["day", "season", "moon_phase"];

/** A readout that rolls to its new value, like the numbers on an iPhone timer. */
function Rolling({ value }: { value: string }) {
  return (
    <span className="relative inline-grid overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "70%", opacity: 0, filter: "blur(3px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(3px)" }}
          transition={spring.snappy}
          className="block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** One instrument readout capsule, top centre. */
export function Metrics() {
  const metrics = useSim((s) => s.metrics);
  useSim((s) => s.projectile);
  useSim((s) => s.gravity);
  const objects = useSim((s) => s.objects);
  const status = useSim((s) => s.projectile?.status);
  useSim((s) => s.modules);
  // Orbit readouts follow the running clock, which lives outside the store.
  const [, tick] = useState(0);
  const clocked = metrics.some((m) => CLOCK_METRICS.includes(m));
  useEffect(() => {
    if (!clocked) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [clocked]);
  const v = placeholderValues();
  const mol = Object.values(objects).find((o) => o.type === "molecule");
  const value = (m: string) => {
    if (m === "bond_angle") return mol?.type === "molecule" && MOLECULES[mol.molecule].angles[0] ? `${MOLECULES[mol.molecule].angles[0].deg}°` : "–";
    if (m !== "gravity" && status === "flying") return "…";
    const [name, arg] = m.split(":");
    return (arg ? undefined : v[name] !== "?" ? v[name] : undefined) ?? resolvePlaceholder(name, arg) ?? "–";
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-10 flex justify-center px-3 sm:top-6">
      <AnimatePresence>
        {metrics.length > 0 && (
          <motion.div key="metrics" {...popover("top center")} className="glass flex overflow-hidden rounded-[18px]" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              {metrics.map((m, i) => (
                <motion.div
                  key={m}
                  layout="position"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={spring.smooth}
                  className={`px-4 py-1.5 text-center ${i ? "border-l border-[var(--hairline)]" : ""}`}
                >
                  <p className="text-[17px] font-extrabold tabular-nums">
                    <Rolling value={value(m)} />
                  </p>
                  <p className="text-[12px] font-semibold text-ink-3">{METRIC_LABEL[m.split(":")[0]] ?? m}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ErrorToast() {
  const err = useSim((s) => s.aiError);
  const set = useSim((s) => s.set);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-[100px]">
      <AnimatePresence>
        {err && (
          <motion.div key={err} {...rise} className="glass pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-[18px] py-2.5 pl-4 pr-2 text-[14px] font-bold" role="alert">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--dot-warning)]" />
            {err}
            <button className="btn btn-quiet grid h-8 w-8 shrink-0 place-items-center rounded-full" aria-label="Dismiss" onClick={() => set({ aiError: null })}>
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
