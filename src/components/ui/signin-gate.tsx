"use client";

// After a guest's free question: a glass card asks them to sign in, holding
// the question they just typed. Signing in sends it (or, for a brand-new
// account, hands it to the welcome flow to send when that finishes).

import { animate, createTimeline, spring, stagger } from "animejs";
import { LogIn } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { signIn, useAuth } from "@/lib/firebase";
import { useSim } from "@/lib/store";
import { useMotion } from "@/lib/useMotion";
import { needsOnboarding } from "@/lib/onboarding";
import { ask } from "@/lib/ask";
import { SIGNUP_BONUS } from "@/lib/credits";

export function SignInGate() {
  const gate = useSim((s) => s.signInGate);
  return gate ? <Gate question={gate.question} /> : null;
}

function Gate({ question }: { question: string }) {
  const motion = useMotion();
  const user = useAuth((a) => a.user);
  const error = useAuth((a) => a.error);
  const veil = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef(false);

  useLayoutEffect(() => {
    // Focus the card (no ring) so keyboard and screen-reader users land in it.
    card.current?.focus({ preventScroll: true });
    if (!motion) return;
    animate(veil.current!, { opacity: [0, 1], duration: 360, ease: "out(3)" });
    createTimeline()
      .add(card.current!, { opacity: { from: 0, to: 1, duration: 260, ease: "out(2)" }, translateY: { from: 30, to: 0 }, scale: { from: 0.94, to: 1 }, ease: spring({ bounce: 0.2, duration: 600 }) }, 0)
      .add(card.current!.querySelector(".gate-mark")!, { scale: [0.3, 1], rotate: [-12, 0], ease: spring({ bounce: 0.45, duration: 620 }) }, 90)
      .add(card.current!.querySelectorAll("[data-in]"), { opacity: { from: 0, to: 1, duration: 300, ease: "out(2)" }, translateY: { from: 10, to: 0 }, ease: spring({ bounce: 0.15, duration: 520 }), delay: stagger(50) }, 160);
    const float = animate(card.current!.querySelector(".gate-mark")!, { translateY: [-3, 3], duration: 2000, ease: "inOutSine", loop: true, alternate: true, delay: 800 });
    return () => void float.revert();
  }, [motion]);

  const close = useCallback(
    (then?: () => void) => {
      if (closing.current) return;
      closing.current = true;
      const done = () => {
        useSim.getState().set({ signInGate: null });
        then?.();
      };
      if (!motion) return done();
      animate(card.current!, { opacity: 0, translateY: 16, scale: 0.97, duration: 200, ease: "in(2)" });
      animate(veil.current!, { opacity: 0, duration: 240, delay: 60, ease: "out(2)", onComplete: done });
    },
    [motion],
  );

  // Signed in: send the held question, or let the new account's welcome send it.
  useEffect(() => {
    if (!user) return;
    close(() => {
      void needsOnboarding(user.uid).then((welcome) => {
        if (welcome) useSim.getState().set({ pendingQuestion: question });
        else void ask(question);
      });
    });
  }, [user, question, close]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div ref={veil} className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(232,236,241,0.5)] px-3 backdrop-blur-[14px]" onClick={(e) => e.target === e.currentTarget && close()}>
      <div ref={card} role="dialog" aria-modal="true" aria-labelledby="gate-title" tabIndex={-1} style={{ outline: "none" }} className="glass w-[min(400px,100%)] rounded-[30px] p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local mark */}
        <img src="/branding/simubox-mark.webp" alt="" width={92} height={92} className="gate-mark mx-auto mb-3 h-[92px] w-[92px]" />
        <h2 id="gate-title" data-in className="text-[24px] font-extrabold leading-tight">
          Sign in to keep exploring
        </h2>
        <p data-in className="mx-auto mt-2 max-w-[300px] text-[15px] font-semibold leading-relaxed text-ink-2">
          Your first question was on us. Sign in with Google to get {SIGNUP_BONUS} free credits (three more lessons) and keep your experiments.
        </p>
        <p data-in className="mx-auto mt-4 rounded-[16px] bg-white/70 px-4 py-3 text-[14.5px] font-bold leading-snug shadow-[0_0_0_0.5px_var(--hairline)]">
          “{question}”
          <span className="mt-1 block text-[12px] font-semibold text-ink-3">We&apos;ll ask this as soon as you&apos;re in.</span>
        </p>
        <div data-in className="mt-5 flex flex-col gap-2">
          <button type="button" className="btn btn-ink flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-extrabold" onClick={() => void signIn()}>
            <LogIn size={18} /> Sign in with Google
          </button>
          <button type="button" className="btn btn-quiet h-11 w-full rounded-full text-[15px] font-bold text-ink-2" onClick={() => close()}>
            Not now
          </button>
        </div>
        {error && (
          <p className="mt-3 text-[13px] font-semibold text-[var(--dot-warning)]" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
