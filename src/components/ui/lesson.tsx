"use client";

import { Check, ChevronDown, RotateCcw, X } from "lucide-react";
import { useState } from "react";
import { useSim } from "@/lib/store";
import { answerQuestion, placeholderValues, replay, skipSpeech } from "@/lib/player";
import { MOLECULES } from "@/lib/engine/chemistry";

const SUPPORT: Record<string, { label: string; dot: string }> = {
  simulated: { label: "Live simulation", dot: "#30a46c" },
  visual: { label: "Illustration", dot: "var(--dot-info)" },
  text: { label: "Explanation", dot: "var(--ink-3)" },
};

/** Tiny Simu face, used wherever the guide "speaks" in the interface. */
export function SimuFace({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className="shrink-0">
      <rect x="1" y="2" width="26" height="23" rx="10" fill="#fff" stroke="rgba(17,24,39,.1)" />
      <rect x="5" y="8" width="18" height="11" rx="5.5" fill="#16203d" />
      <rect x="8.5" y="11" width="3" height="5" rx="1.5" fill="#67e8f9" />
      <rect x="16.5" y="11" width="3" height="5" rx="1.5" fill="#67e8f9" />
    </svg>
  );
}

export function ExplanationCard() {
  const ex = useSim((s) => s.explanation);
  // Step aside while a prediction question is waiting, so the question has the stage.
  const asking = useSim((s) => Boolean(s.question && s.question.picked === null));
  const formula = useSim((s) => s.formula);
  const hasPlan = useSim((s) => Boolean(s.lastPlan));
  const set = useSim((s) => s.set);
  const [more, setMore] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!ex || asking) return null;
  const outOfScope = ex.scope !== "in_scope";
  const support = SUPPORT[ex.supportLevel];

  const body = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <SimuFace />
        <span className="text-[15px] font-extrabold">Simu</span>
        {!outOfScope && (
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: support.dot }} />
            {support.label}
          </span>
        )}
        <button className="btn btn-quiet ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-2" aria-label="Hide Simu's answer" onClick={() => set({ explanation: null })}>
          <X size={17} />
        </button>
      </div>
      <h2 className="text-[20px] font-extrabold leading-tight">{ex.title}</h2>
      <p className="mt-1.5 text-[15px] font-semibold leading-relaxed text-ink-2">{ex.reply}</p>

      {formula && (
        <div className="group-rows mt-3">
          <div className="px-3.5 pb-2 pt-2.5">
            <p className="text-[13px] font-semibold text-ink-3">{formula.title}</p>
            <p className="mt-0.5 text-[19px] font-extrabold tracking-tight">{formula.formula}</p>
          </div>
          {formula.variables.map((v) => (
            <div key={v.symbol} className="flex items-baseline gap-3 px-3.5 py-2 text-[14px]">
              <span className="w-6 shrink-0 font-extrabold italic">{v.symbol}</span>
              <span className="font-semibold text-ink-2">
                {v.meaning}
                {v.unit ? `, in ${v.unit}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {more && (
        <div className="fade mt-3 space-y-3 text-[14px] font-semibold leading-relaxed text-ink-2">
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
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(ex.details || ex.assumptions.length > 0 || ex.limitations.length > 0) && (
          <button className="btn btn-quiet flex h-9 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3 text-[14px] font-bold" aria-expanded={more} onClick={() => setMore(!more)}>
            <ChevronDown size={16} className={`transition-transform duration-300 ${more ? "rotate-180" : ""}`} />
            {more ? "Less" : "Tell me more"}
          </button>
        )}
        {hasPlan && !outOfScope && (
          <button className="btn btn-quiet flex h-9 items-center gap-1.5 rounded-full bg-[var(--fill)] px-3 text-[14px] font-bold" onClick={() => void replay()}>
            <RotateCcw size={15} /> Watch again
          </button>
        )}
      </div>

      {ex.source === "offline-demo" && <p className="mt-3 text-[12px] font-semibold leading-snug text-ink-3">Offline demo: a pre-written lesson, because the AI isn&apos;t connected on this server.</p>}
    </>
  );

  return (
    <>
      {/* Desktop: left side, vertically centred. */}
      <div className="pointer-events-none fixed inset-y-0 left-6 z-10 hidden items-center py-[84px] lg:flex">
        <aside key={ex.title} className="glass sheet scroll-thin pointer-events-auto max-h-full w-[340px] overflow-y-auto rounded-[22px] p-4" aria-live="polite" aria-label="Simu's answer">
          {body}
        </aside>
      </div>
      {/* Phones and tablets: a slim bar under the top tools that opens into a sheet. */}
      <div className="lg:hidden">
        {mobileOpen ? (
          <aside className="glass sheet scroll-thin fixed inset-x-3 top-[68px] z-30 max-h-[60dvh] overflow-y-auto rounded-[22px] p-4" aria-label="Simu's answer">
            {body}
          </aside>
        ) : (
          <button className="glass btn pop fixed left-[68px] right-[116px] top-3 z-20 flex h-11 items-center gap-2 rounded-full pl-1.5 pr-4 text-left text-[14px] font-bold sm:top-6" onClick={() => setMobileOpen(true)}>
            <SimuFace size={32} />
            <span className="truncate">{ex.title}</span>
          </button>
        )}
      </div>
    </>
  );
}

export function NarratorCaption() {
  const speech = useSim((s) => s.speech);
  // Character lines show as bubbles in 3D; narrator lines sit above the composer.
  if (!speech || speech.speaker !== "narrator") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 sm:bottom-[100px]">
      <button key={speech.key} className="pop pointer-events-auto flex max-w-[620px] items-start gap-2.5 rounded-[22px] bg-white px-4 py-3 text-left shadow-[0_10px_28px_-8px_rgba(31,41,55,0.35)]" onClick={skipSpeech} aria-live="polite" aria-label={`Simu says: ${speech.text}. Click to skip.`}>
        <SimuFace size={26} />
        <span className="pt-0.5 text-[16px] font-bold leading-snug">{speech.text}</span>
      </button>
    </div>
  );
}

export function QuestionCard() {
  const q = useSim((s) => s.question);
  if (!q) return null;
  const done = q.picked !== null;
  const right = q.picked === q.answerIndex;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-30 flex justify-center px-3 sm:top-[84px]">
      <div className="glass sheet pointer-events-auto w-full max-w-[440px] rounded-[22px] p-4" role="dialog" aria-label="Make a prediction">
        <p className="text-[13px] font-semibold text-ink-3">Make a guess, then watch</p>
        <p className="mb-3 mt-0.5 text-[19px] font-extrabold leading-snug">{q.question}</p>
        <div className="group-rows">
          {q.choices.map((c, i) => {
            const isAnswer = done && i === q.answerIndex;
            const wrongPick = done && i === q.picked && !right;
            return (
              <button key={c} disabled={done} className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-[15px] font-bold transition-transform duration-300 enabled:active:scale-[0.98]" onClick={() => answerQuestion(i)}>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${isAnswer ? "border-[#30a46c] bg-[#30a46c] text-white" : wrongPick ? "border-[var(--dot-warning)] bg-[var(--dot-warning)] text-white" : "border-[var(--fill-2)]"}`}>
                  {isAnswer && <Check size={14} strokeWidth={3} />}
                  {wrongPick && <X size={14} strokeWidth={3} />}
                </span>
                <span className={done && !isAnswer ? "text-ink-3" : ""}>{c}</span>
              </button>
            );
          })}
        </div>
        {done ? (
          <p className="fade mt-3 text-[15px] font-semibold leading-relaxed text-ink-2">
            <span className="font-extrabold text-ink">{right ? "You got it. " : "Good guess. "}</span>
            {q.explanation}
          </p>
        ) : (
          <button className="mt-2 text-[13px] font-bold text-ink-3 hover:text-ink" onClick={() => answerQuestion(q.answerIndex)}>
            Skip and show me
          </button>
        )}
      </div>
    </div>
  );
}

const METRIC_LABEL: Record<string, string> = { range: "lands at", flight_time: "in the air", max_height: "highest point", impact_speed: "landing speed", gravity: "gravity", bond_angle: "bond angle" };

/** One instrument readout capsule, top centre. */
export function Metrics() {
  const metrics = useSim((s) => s.metrics);
  useSim((s) => s.projectile);
  useSim((s) => s.gravity);
  const objects = useSim((s) => s.objects);
  const status = useSim((s) => s.projectile?.status);
  if (!metrics.length) return null;
  const v = placeholderValues();
  const mol = Object.values(objects).find((o) => o.type === "molecule");
  const value = (m: string) => {
    if (m === "bond_angle") return mol?.type === "molecule" && MOLECULES[mol.molecule].angles[0] ? `${MOLECULES[mol.molecule].angles[0].deg}°` : "–";
    if (m !== "gravity" && status === "flying") return "…";
    return v[m] ?? "–";
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[68px] z-10 flex justify-center px-3 sm:top-6">
      <div className="glass pop flex overflow-hidden rounded-[18px]" aria-live="polite">
        {metrics.map((m, i) => (
          <div key={m} className={`px-4 py-1.5 text-center ${i ? "border-l border-[var(--hairline)]" : ""}`}>
            <p className="text-[17px] font-extrabold tabular-nums">{value(m)}</p>
            <p className="text-[12px] font-semibold text-ink-3">{METRIC_LABEL[m]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorToast() {
  const err = useSim((s) => s.aiError);
  const set = useSim((s) => s.set);
  if (!err) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 sm:bottom-[100px]">
      <div className="glass pop pointer-events-auto flex max-w-[520px] items-center gap-3 rounded-[18px] py-2.5 pl-4 pr-2 text-[14px] font-bold" role="alert">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--dot-warning)]" />
        {err}
        <button className="btn btn-quiet grid h-8 w-8 shrink-0 place-items-center rounded-full" aria-label="Dismiss" onClick={() => set({ aiError: null })}>
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
