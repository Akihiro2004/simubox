"use client";

import { X } from "lucide-react";
import { useSim, type InfoCard } from "@/lib/store";
import { resolvePlaceholder } from "@/lib/player";
import { fillPlaceholders } from "@/lib/ssp/validate";

const TONE: Record<InfoCard["tone"], string> = { info: "var(--dot-info)", fact: "var(--dot-fact)", warning: "var(--dot-warning)", question: "var(--dot-question)" };

/** One info card, in the same design as the controls card. */
export function InfoCardView({ card: raw, compact = false }: { card: InfoCard; compact?: boolean }) {
  const set = useSim((s) => s.set);
  // Re-render on simulation changes so engine numbers stay current.
  useSim((s) => s.modules);
  useSim((s) => s.objects);
  useSim((s) => s.gravity);
  useSim((s) => s.projectile);
  const fill = (t: string) => fillPlaceholders(t, resolvePlaceholder);
  const card = { ...raw, title: fill(raw.title), subtitle: raw.subtitle && fill(raw.subtitle), rows: raw.rows.map((r) => ({ label: fill(r.label), value: fill(r.value) })), bullets: raw.bullets.map(fill) };
  return (
    <section className={`glass pop pointer-events-auto rounded-[22px] p-3 ${compact ? "w-[260px]" : "w-[min(360px,calc(100vw-24px))]"}`} aria-label={card.title}>
      <div className="flex items-start gap-2 pb-2 pl-1">
        <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[card.tone] }} />
        <div className="min-w-0 flex-1">
          <h2 className={`${compact ? "text-[15px]" : "text-[17px]"} font-extrabold leading-snug first-letter:uppercase`}>{card.title}</h2>
          {card.subtitle && <p className="text-[13px] font-semibold leading-snug text-ink-3">{card.subtitle}</p>}
        </div>
        <button className="btn btn-quiet grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-2" aria-label="Close card" onClick={() => set({ cards: useSim.getState().cards.filter((k) => k.id !== card.id) })}>
          <X size={17} />
        </button>
      </div>
      {card.rows.length > 0 && (
        <div className="group-rows">
          {card.rows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between gap-3 px-3.5 ${compact ? "py-2 text-[14px]" : "py-2.5 text-[15px]"}`}>
              <span className="font-semibold text-ink-2">{r.label}</span>
              <span className="text-right font-bold tabular-nums">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {card.bullets.length > 0 && (
        <ul className={`space-y-1.5 px-1 ${card.rows.length ? "pt-2.5" : ""} ${compact ? "text-[13px]" : "text-[14px]"} font-semibold leading-snug text-ink-2`}>
          {card.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-3)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Centre-of-screen cards (up to two side by side). */
export function CenterCards() {
  const cards = useSim((s) => s.cards);
  const center = cards.filter((c) => c.placement === "center").slice(-2);
  if (!center.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[20vh] z-30 flex flex-wrap items-start justify-center gap-3 px-3">
      {center.map((c) => (
        <InfoCardView key={c.id} card={c} />
      ))}
    </div>
  );
}
