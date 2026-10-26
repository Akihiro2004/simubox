"use client";

import { Bed, Bookmark, Clock, Coins, FlaskConical, Globe, HeartPulse, Lightbulb, LogIn, LogOut, Menu, MessageCircleQuestion, MessageSquare, Orbit, Plus, Settings, Shapes, Sigma, Trash, TreePine, Trophy, User, Droplets, Volume2, VolumeX, Wrench, X } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSim } from "@/lib/store";
import { useBuilder } from "@/lib/builder/store";
import { cascade, popover, spring, swap } from "@/lib/motion";
import { Segmented, SwapIcon } from "./kit";
import { MorphPanel, useViewport } from "./morph";
import { ExplanationContent, useExplanationShown } from "./lesson";
import { signIn, signOutUser, useAuth } from "@/lib/firebase";
import { deleteExperiment, listExperiments, restoreExperiment, saveExperiment, type SavedExperiment } from "@/lib/saves";
import { cancelPlayback, resolvePlaceholder } from "@/lib/player";
import { fillProse } from "@/lib/ssp/validate";
import { stopSpeaking, ttsSupported } from "@/lib/tts";
import type { WorldId } from "@/lib/world/catalog";

export const WORLD_ITEMS: { id: WorldId; name: string; hint: string; icon: typeof Bed }[] = [
  { id: "bedroom", name: "Bedroom", hint: "Gravity, pushes and falling", icon: Bed },
  { id: "court", name: "Sports court", hint: "Throwing and flight paths", icon: Trophy },
  { id: "lab", name: "Science lab", hint: "Atoms and molecules", icon: FlaskConical },
  { id: "park", name: "Park", hint: "Plants, weather and nature", icon: TreePine },
  { id: "space", name: "Space", hint: "Planets, orbits, Moon and seasons", icon: Orbit },
  { id: "ocean", name: "Ocean dock", hint: "Floating, sinking and density", icon: Droplets },
  { id: "math_studio", name: "Math studio", hint: "Arithmetic to algebra, geometry and statistics", icon: Sigma },
  { id: "math", name: "Math grid", hint: "Graphs, shapes, area and volume", icon: Sigma },
  { id: "globe", name: "Globe", hint: "Countries, places and distances", icon: Globe },
  { id: "anatomy", name: "Anatomy lab", hint: "The human body, organs and how they work", icon: HeartPulse },
  { id: "mechanics", name: "Mechanics lab", hint: "Forces, acceleration, momentum and energy", icon: Wrench },
  { id: "workshop", name: "Workshop", hint: "Circuits, levers, waves and ripples", icon: Wrench },
  { id: "optics", name: "Light lab", hint: "Mirrors, lenses, prisms and rainbows", icon: Lightbulb },
  { id: "stage", name: "Blank stage", hint: "Anything else, as a diagram", icon: Shapes },
];

export function openWorld(id: WorldId) {
  cancelPlayback();
  const s = useSim.getState();
  s.loadWorld(id);
  s.set({ topic: null });
  if (id === "lab") {
    useSim.getState().upsertObject({ id: "water", type: "molecule", molecule: "H2O", position: [0, 2.1, 0], rotation: [0, 0, 0], scale: 1, physics: "none", massKg: 1, bounciness: 0, drag: 0, visible: true, version: 0 });
  }
}

export function resetToNewExperiment() {
  cancelPlayback();
  const s = useSim.getState();
  s.loadWorld("bedroom");
  s.set({ messages: [], explanation: null, followUps: [], lastPlan: null, experimentId: null, experimentTitle: null, draft: "", formula: null, metrics: [], topic: null });
}

const toolClass = "glass btn grid h-11 w-11 place-items-center rounded-full";

export function TopBar() {
  const menuOpen = useSim((s) => s.menuOpen);
  const topic = useSim((s) => s.topic);
  const set = useSim((s) => s.set);
  const settingsOpen = useSim((s) => s.settingsOpen);
  const hasAnswer = useSim((s) => Boolean(s.explanation));
  const user = useAuth((a) => a.user);
  // Phones have no room for the answer beside the world: the question pill opens it.
  const phoneAnswer = useViewport().w < 1024 && hasAnswer;
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
      <h1 className="sr-only">SimuBox</h1>
      <div className="flex min-w-0 items-start gap-2">
        <button className={`${toolClass} pointer-events-auto shrink-0`} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => set({ menuOpen: !menuOpen, settingsOpen: false, accountOpen: false, transcriptOpen: false })}>
          <SwapIcon id={menuOpen ? "x" : "menu"}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</SwapIcon>
        </button>
        <AnimatePresence>
          {topic && !menuOpen && (
            // The question being answered; opens Simu's answer on phones, else the conversation.
            <motion.button
              key="topic"
              {...popover("left center")}
              className="glass pointer-events-auto flex h-11 min-w-0 max-w-[min(520px,calc(100vw-180px))] items-center gap-2 overflow-hidden rounded-full pl-3 pr-4 text-left"
              title={topic}
              aria-label={`Current question: ${topic}. ${phoneAnswer ? "Open Simu's answer." : "Open the conversation."}`}
              whileTap={{ scale: 0.95 }}
              onClick={() => set(phoneAnswer ? { explanationOpen: true, transcriptOpen: false, menuOpen: false, settingsOpen: false, accountOpen: false } : { transcriptOpen: true, menuOpen: false, settingsOpen: false, accountOpen: false })}
            >
              <MessageCircleQuestion size={18} className="shrink-0 text-ink-2" />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span key={topic} {...swap} className="truncate text-[15px] font-bold">
                  {topic}
                </motion.span>
              </AnimatePresence>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <div className="pointer-events-auto flex gap-2">
        <CreditsChip />
        <MuteButton />
        <button className={toolClass} aria-label="Settings" aria-expanded={settingsOpen} onClick={() => set({ settingsOpen: !settingsOpen, accountOpen: false, menuOpen: false, transcriptOpen: false })}>
          <Settings size={20} />
        </button>
        <AccountButton photo={user?.photo ?? null} name={user?.name ?? null} />
      </div>
    </header>
  );
}

/** The balance every question and unlock spends; opens the credits store. */
function CreditsChip() {
  const credits = useBuilder((s) => s.wallet.credits);
  const ready = useBuilder((s) => s.ready);
  return (
    <Link href="/wallet" className="glass btn flex h-11 items-center gap-1.5 rounded-full pl-3 pr-4 text-[15px] font-extrabold" aria-label={ready ? `${credits} credits. Get more credits.` : "Credits"}>
      <Coins size={18} className="text-[var(--accent-press)]" />
      {ready ? credits : "…"}
    </Link>
  );
}

/** Muted = no voice is generated or played at all; captions still show. */
function MuteButton() {
  const voice = useSim((s) => s.settings.voice);
  const update = useSim((s) => s.updateSettings);
  return (
    <button
      className={toolClass}
      aria-label={voice ? "Mute voice" : "Unmute voice"}
      aria-pressed={!voice}
      title={voice ? "Mute voice" : "Unmute voice"}
      onClick={() => {
        if (voice) stopSpeaking();
        update({ voice: !voice });
      }}
    >
      <SwapIcon id={voice ? "on" : "off"}>{voice ? <Volume2 size={20} /> : <VolumeX size={20} />}</SwapIcon>
    </button>
  );
}

function AccountButton({ photo, name }: { photo: string | null; name: string | null }) {
  const open = useSim((s) => s.accountOpen);
  const set = useSim((s) => s.set);
  const user = useAuth((a) => a.user);
  return (
    <button
      className={`${toolClass} overflow-hidden`}
      aria-label={user ? `Account: ${name ?? "signed in"}` : "Sign in"}
      aria-expanded={open}
      onClick={() => set({ accountOpen: !open, settingsOpen: false, menuOpen: false, transcriptOpen: false })}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny */}
      {photo ? <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={20} />}
    </button>
  );
}

/** Account and sign-in: shares the top-right card with settings. */
function AccountContent() {
  const user = useAuth((a) => a.user);
  const error = useAuth((a) => a.error);
  const available = useAuth((a) => a.available);
  return (
    <div className="p-3" role="dialog" aria-label="Account">
      {user ? (
        <>
          <p className="px-1 text-[15px] font-extrabold">{user.name ?? "Signed in"}</p>
          <p className="mb-3 truncate px-1 text-[13px] font-semibold text-ink-3">{user.email}</p>
          <p className="mb-3 px-1 text-[14px] font-semibold text-ink-2">Saved experiments sync to this account.</p>
          <button className="btn btn-quiet flex h-11 w-full items-center gap-2 rounded-[14px] bg-[var(--fill)] px-3 text-[15px] font-bold" onClick={() => void signOutUser()}>
            <LogOut size={18} /> Sign out
          </button>
        </>
      ) : available ? (
        <>
          <p className="mb-3 px-1 text-[14px] font-semibold text-ink-2">Sign in to keep your experiments on every device. Everything else works without an account.</p>
          <button className="btn btn-ink flex h-11 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold" onClick={() => void signIn()}>
            <LogIn size={18} /> Sign in with Google
          </button>
        </>
      ) : (
        <p className="px-1 text-[14px] font-semibold text-ink-2">You&apos;re using SimuBox as a guest. Saved experiments stay in this browser.</p>
      )}
      {error && <p className="mt-2 px-1 text-[13px] font-semibold text-[var(--dot-warning)]">{error}</p>}
    </div>
  );
}

export function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function Caption({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-2 pb-1.5 pt-4">
      <h2 className="text-[13px] font-semibold text-ink-3">{children}</h2>
      {action}
    </div>
  );
}

function MenuRow({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint?: string; onClick: () => void }) {
  return (
    <button className="btn flex w-full min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-black/[0.03]" onClick={onClick}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-[var(--fill)] text-ink-2">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-bold">{title}</span>
        {hint && <span className="truncate text-[13px] font-semibold text-ink-3">{hint}</span>}
      </span>
    </button>
  );
}

/** Each section of a panel cascades in after the glass opens. */
function Section({ children }: { children: React.ReactNode }) {
  return <motion.div variants={cascade.child}>{children}</motion.div>;
}

let savesCache: SavedExperiment[] | null = null;

function MenuContent() {
  const set = useSim((s) => s.set);
  const messages = useSim((s) => s.messages);
  const user = useAuth((a) => a.user);
  // Start from the last list, so the card opens at its final height instead
  // of growing a second time when the list arrives.
  const [saves, setSavesState] = useState<SavedExperiment[] | null>(savesCache);
  const setSaves = (l: SavedExperiment[]) => {
    savesCache = l;
    setSavesState(l);
  };
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listExperiments()
      .then((l) => alive && setSaves(l))
      .catch(() => alive && setSaves([]));
    return () => {
      alive = false;
    };
  }, [user]);

  const recent = messages.filter((m) => m.role === "user").slice(-4).reverse();
  const close = () => set({ menuOpen: false });

  return (
    <nav className="p-2" aria-label="Menu">
     <motion.div variants={cascade.parent} initial="hidden" animate="show">
      <Section>
      <button
        className="btn btn-accent flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold"
        onClick={() => {
          resetToNewExperiment();
          close();
        }}
      >
        <Plus size={19} strokeWidth={2.4} /> New experiment
      </button>

      </Section>
      <Section>
      <Caption>Worlds</Caption>
      <div className="group-rows overflow-hidden">
        {WORLD_ITEMS.map((w) => (
          <MenuRow
            key={w.id}
            icon={<w.icon size={17} />}
            title={w.name}
            hint={w.hint}
            onClick={() => {
              openWorld(w.id);
              close();
            }}
          />
        ))}
      </div>
      </Section>

      <Section>
      <Caption
        action={
          <button
            className="btn rounded-full px-2 py-1 text-[13px] font-bold text-[var(--dot-info)]"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const exp = await saveExperiment();
                setNote(`Saved “${exp.title}”${user ? "" : " in this browser"}.`);
                setSaves(await listExperiments());
              } catch {
                setNote("Couldn't save. Check your connection and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save this one
          </button>
        }
      >
        Saved experiments
      </Caption>
      <AnimatePresence initial={false}>
        {note && (
          <motion.p key={note} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.layout} className="overflow-hidden px-2 text-[13px] font-semibold text-ink-2">
            <span className="block pb-2">{note}</span>
          </motion.p>
        )}
      </AnimatePresence>
      <div className="group-rows overflow-hidden">
        {saves === null && <p className="px-3 py-2.5 text-[14px] font-semibold text-ink-3">Loading…</p>}
        {saves?.length === 0 && <p className="px-3 py-2.5 text-[14px] font-semibold text-ink-3">Nothing saved yet.</p>}
        {saves?.map((e) => (
          <div key={e.id} className="flex items-center pr-1.5">
            <MenuRow
              icon={<Bookmark size={16} />}
              title={e.title}
              hint={ago(e.updatedAt)}
              onClick={() => {
                cancelPlayback();
                restoreExperiment(e);
                close();
              }}
            />
            <button
              className="btn btn-quiet grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3"
              aria-label={`Delete ${e.title}`}
              onClick={async () => {
                if (!confirm(`Delete “${e.title}”?`)) return;
                await deleteExperiment(e.id);
                setSaves(await listExperiments());
              }}
            >
              <Trash size={15} />
            </button>
          </div>
        ))}
      </div>
      </Section>

      {recent.length > 0 && (
        <Section>
          <Caption>Recent questions</Caption>
          <div className="group-rows overflow-hidden">
            {recent.map((m) => (
              <MenuRow key={m.id} icon={<Clock size={16} />} title={m.text} hint={ago(m.at)} onClick={() => (set({ draft: m.text }), close())} />
            ))}
          </div>
        </Section>
      )}

      <Section>
      <div className="group-rows mt-4 overflow-hidden">
        <MenuRow icon={<MessageSquare size={16} />} title="Conversation" hint="Everything you asked and Simu said" onClick={() => set({ transcriptOpen: true, menuOpen: false })} />
      </div>
      <div className="flex gap-4 px-2 pb-1 pt-3 text-[13px] font-semibold text-ink-3">
        <Link href="/" className="hover:text-ink" onClick={close}>
          Home
        </Link>
        <Link href="/credits" className="hover:text-ink">
          About and credits
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </div>
      </Section>
     </motion.div>
    </nav>
  );
}

const Seg = Segmented;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3">
      <p className="mb-2 text-[15px] font-bold">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}

function SettingsContent() {
  const settings = useSim((s) => s.settings);
  const update = useSim((s) => s.updateSettings);
  const set = useSim((s) => s.set);
  return (
    <div className="p-2" role="dialog" aria-label="Settings">
      <div className="flex items-center px-2 pb-2 pt-1">
        <h2 className="text-[17px] font-extrabold">Settings</h2>
        <button className="btn btn-quiet ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-2" aria-label="Close settings" onClick={() => set({ settingsOpen: false })}>
          <X size={17} />
        </button>
      </div>
      <div className="group-rows">
        <Field label="Animations" hint="Off keeps the world still and calm. Auto follows your device setting.">
          <Seg label="Animations" value={settings.motion} options={[["auto", "Auto"], ["on", "On"], ["off", "Off"]]} onChange={(motion) => update({ motion })} />
        </Field>
        <Field label="Graphics" hint="Use Low on older phones and laptops.">
          <Seg label="Graphics" value={settings.quality} options={[["auto", "Auto"], ["low", "Low"], ["medium", "Medium"], ["high", "High"]]} onChange={(quality) => update({ quality })} />
        </Field>
        <Field label="Read lines aloud" hint={ttsSupported() ? "Natural AI voices, a different one for each character. Captions always show." : "This browser can't play audio. Captions still show."}>
          <Seg label="Read lines aloud" value={settings.voice ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => update({ voice: v === "on" })} />
          <AnimatePresence initial={false}>
          {settings.voice && (
            <motion.div key="rate" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.layout} className="overflow-hidden">
            <label className="mt-2 flex items-center gap-3 text-[14px] font-semibold text-ink-2">
              Speed
              <input
                type="range"
                className="slider"
                min={0.7}
                max={1.4}
                step={0.05}
                value={settings.voiceRate}
                style={{ ["--fill" as string]: `${((settings.voiceRate - 0.7) / 0.7) * 100}%` }}
                onChange={(e) => update({ voiceRate: Number(e.target.value) })}
              />
              <span className="w-10 text-right tabular-nums">{settings.voiceRate.toFixed(2)}×</span>
            </label>
            <p className="mb-1.5 mt-3 text-[13px] font-semibold text-ink-3">English voice</p>
            <Seg
              label="English voice"
              value={settings.englishVoice ?? "gemini"}
              options={[["gemini", "Google Gemini"], ["speechify", "Speechify"]]}
              onChange={(englishVoice) => update({ englishVoice })}
            />
            </motion.div>
          )}
          </AnimatePresence>
        </Field>
        <Field label="Language">
          <Seg label="Language" value={settings.language} options={[["auto", "Auto"], ["en", "English"], ["id", "Indonesia"]]} onChange={(language) => update({ language })} />
        </Field>
        <Field label="School level" hint="Simu explains things at this level.">
          <Seg label="School level" value={settings.gradeBand} options={[["elementary", "Primary"], ["middle", "Middle"], ["high", "High school"]]} onChange={(gradeBand) => update({ gradeBand })} />
        </Field>
      </div>
    </div>
  );
}

function TranscriptContent() {
  const messages = useSim((s) => s.messages);
  const set = useSim((s) => s.set);
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef(0);
  // Open at the latest line, and glide to new ones as they arrive.
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: seen.current ? "smooth" : "instant" });
    seen.current = messages.length;
  }, [messages.length]);
  return (
    <aside className="flex flex-col p-2" aria-label="Conversation">
      <div className="flex items-center px-2 pb-2 pt-1">
        <h2 className="text-[17px] font-extrabold">Conversation</h2>
        <button className="btn btn-quiet ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-2" aria-label="Close conversation" onClick={() => set({ transcriptOpen: false })}>
          <X size={17} />
        </button>
      </div>
      <ol ref={list} className="scroll-thin flex max-h-[calc(100dvh-240px)] flex-col gap-1.5 overflow-y-auto px-1 pb-1" aria-live="polite">
        {messages.length === 0 && <li className="px-2 py-1 text-[14px] font-semibold text-ink-3">Your questions and everything Simu says will show up here.</li>}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.li
              key={m.id}
              initial={{ opacity: 0, y: 12, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={spring.bouncy}
              style={{ transformOrigin: m.role === "user" ? "100% 100%" : "0% 100%" }}
              className={`max-w-[88%] rounded-[18px] px-3 py-2 text-[14px] font-semibold leading-snug ${m.role === "user" ? "self-end bg-[var(--ink)] text-white" : m.speech ? "bg-white/80 text-ink-2" : "bg-white text-ink"}`}
            >
              {m.role === "assistant" ? fillProse(m.text, resolvePlaceholder) : m.text}
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </aside>
  );
}

// ---------- shared cards ----------

/** Phones and tablets get the full width; wider screens a fixed column. */
const fit = (px: number, vw: number) => Math.min(px, vw - 24);

/**
 * Top right: settings and the account share one card, so moving between them
 * morphs the card instead of closing one panel and opening another.
 */
export function RightPanel() {
  const settings = useSim((s) => s.settingsOpen);
  const account = useSim((s) => s.accountOpen);
  const set = useSim((s) => s.set);
  const { w } = useViewport();
  const which = settings ? "settings" : account ? "account" : null;

  useEffect(() => {
    if (!which) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ settingsOpen: false, accountOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [which, set]);

  return (
    <MorphPanel contentKey={which} side="right" width={fit(which === "account" ? 288 : 360, w)} area="right-3 top-[64px] bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 sm:right-6 sm:top-[80px] sm:bottom-[100px]">
      {which === "settings" ? <SettingsContent /> : <AccountContent />}
    </MorphPanel>
  );
}

/**
 * Left: Simu's answer, the menu and the conversation share one card. The
 * answer is what it rests on; opening the menu morphs the answer into the
 * menu, and closing it morphs back.
 */
export function LeftPanel() {
  const menu = useSim((s) => s.menuOpen);
  const transcript = useSim((s) => s.transcriptOpen);
  const title = useSim((s) => s.explanation?.title);
  const set = useSim((s) => s.set);
  const { w } = useViewport();
  const desktop = w >= 1024;
  const explaining = useExplanationShown(desktop);
  const which = menu ? "menu" : transcript ? "transcript" : explaining ? `answer:${title}` : null;

  useEffect(() => {
    if (!menu && !transcript) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ menuOpen: false, transcriptOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu, transcript, set]);

  const answer = Boolean(which?.startsWith("answer:"));
  return (
    <MorphPanel
      contentKey={which}
      side="left"
      width={fit(menu ? 320 : transcript ? 380 : 340, w)}
      // The answer sits centred beside the world on desktop, under the speech bubbles.
      center={answer && desktop}
      area={`left-3 top-[64px] bottom-[calc(84px+env(safe-area-inset-bottom))] sm:left-6 sm:top-[80px] sm:bottom-[100px] ${answer ? "z-30" : "z-40"}`}
    >
      {menu ? <MenuContent /> : transcript ? <TranscriptContent /> : <ExplanationContent />}
    </MorphPanel>
  );
}
