"use client";

import { Bed, Bookmark, Clock, FlaskConical, Globe, LogIn, LogOut, Menu, MessageCircleQuestion, MessageSquare, Orbit, Plus, Settings, Shapes, Sigma, Trash, TreePine, Trophy, User, Droplets, Volume2, VolumeX, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSim } from "@/lib/store";
import { signIn, signOutUser, useAuth } from "@/lib/firebase";
import { deleteExperiment, listExperiments, restoreExperiment, saveExperiment, type SavedExperiment } from "@/lib/saves";
import { cancelPlayback } from "@/lib/player";
import { stopSpeaking, ttsSupported } from "@/lib/tts";
import type { WorldId } from "@/lib/world/catalog";

const WORLD_ITEMS: { id: WorldId; name: string; hint: string; icon: typeof Bed }[] = [
  { id: "bedroom", name: "Bedroom", hint: "Gravity, pushes and falling", icon: Bed },
  { id: "court", name: "Sports court", hint: "Throwing and flight paths", icon: Trophy },
  { id: "lab", name: "Science lab", hint: "Atoms and molecules", icon: FlaskConical },
  { id: "park", name: "Park", hint: "Plants, weather and nature", icon: TreePine },
  { id: "space", name: "Space", hint: "Planets, orbits, Moon and seasons", icon: Orbit },
  { id: "ocean", name: "Ocean dock", hint: "Floating, sinking and density", icon: Droplets },
  { id: "math", name: "Math grid", hint: "Graphs, shapes, area and volume", icon: Sigma },
  { id: "globe", name: "Globe", hint: "Countries, places and distances", icon: Globe },
  { id: "workshop", name: "Workshop", hint: "Circuits, levers and waves", icon: Wrench },
  { id: "stage", name: "Blank stage", hint: "Anything else, as a diagram", icon: Shapes },
];

const toolClass = "glass btn grid h-11 w-11 place-items-center rounded-full";

export function TopBar() {
  const menuOpen = useSim((s) => s.menuOpen);
  const topic = useSim((s) => s.topic);
  const set = useSim((s) => s.set);
  const user = useAuth((a) => a.user);
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-6 sm:pt-6">
      <h1 className="sr-only">SimuBox</h1>
      <div className="flex min-w-0 items-start gap-2">
        <button className={`${toolClass} pointer-events-auto shrink-0`} aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} onClick={() => set({ menuOpen: !menuOpen, settingsOpen: false, transcriptOpen: false })}>
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        {topic && !menuOpen && (
          // The question being answered; opens the conversation for the full text.
          <button
            key={topic}
            className="glass btn pop pointer-events-auto flex h-11 min-w-0 max-w-[min(520px,calc(100vw-180px))] items-center gap-2 rounded-full pl-3 pr-4 text-left"
            title={topic}
            aria-label={`Current question: ${topic}. Open the conversation.`}
            onClick={() => set({ transcriptOpen: true, menuOpen: false, settingsOpen: false })}
          >
            <MessageCircleQuestion size={18} className="shrink-0 text-ink-2" />
            <span className="truncate text-[15px] font-bold">{topic}</span>
          </button>
        )}
      </div>
      <div className="pointer-events-auto flex gap-2">
        <MuteButton />
        <button className={toolClass} aria-label="Settings" aria-expanded={useSim.getState().settingsOpen} onClick={() => set({ settingsOpen: !useSim.getState().settingsOpen, menuOpen: false, transcriptOpen: false })}>
          <Settings size={20} />
        </button>
        <AccountButton photo={user?.photo ?? null} name={user?.name ?? null} />
      </div>
    </header>
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
      {voice ? <Volume2 size={20} /> : <VolumeX size={20} />}
    </button>
  );
}

function AccountButton({ photo, name }: { photo: string | null; name: string | null }) {
  const [open, setOpen] = useState(false);
  const user = useAuth((a) => a.user);
  const error = useAuth((a) => a.error);
  const available = useAuth((a) => a.available);
  return (
    <div className="relative">
      <button className={`${toolClass} overflow-hidden`} aria-label={user ? `Account: ${name ?? "signed in"}` : "Sign in"} aria-expanded={open} onClick={() => setOpen(!open)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote avatar, tiny */}
        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <User size={20} />}
      </button>
      {open && (
        <div className="glass sheet absolute right-0 top-14 w-72 rounded-[22px] p-3" style={{ transformOrigin: "top right" }}>
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
      )}
    </div>
  );
}

function ago(ms: number) {
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

export function MenuPanel() {
  const open = useSim((s) => s.menuOpen);
  const set = useSim((s) => s.set);
  const messages = useSim((s) => s.messages);
  const user = useAuth((a) => a.user);
  const [saves, setSaves] = useState<SavedExperiment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listExperiments()
      .then((l) => alive && setSaves(l))
      .catch(() => alive && setSaves([]));
    return () => {
      alive = false;
    };
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && set({ menuOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, set]);

  if (!open) return null;
  const recent = messages.filter((m) => m.role === "user").slice(-4).reverse();
  const close = () => set({ menuOpen: false });

  return (
    <nav className="glass sheet scroll-thin fixed left-3 top-[64px] z-40 max-h-[calc(100dvh-160px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-[22px] p-2 sm:left-6 sm:top-[80px]" style={{ transformOrigin: "top left" }} aria-label="Menu">
      <button
        className="btn btn-accent flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-extrabold"
        onClick={() => {
          cancelPlayback();
          useSim.getState().loadWorld("bedroom");
          set({ messages: [], explanation: null, followUps: [], lastPlan: null, experimentId: null, experimentTitle: null, draft: "", formula: null, metrics: [], topic: null });
          close();
        }}
      >
        <Plus size={19} strokeWidth={2.4} /> New experiment
      </button>

      <Caption>Worlds</Caption>
      <div className="group-rows overflow-hidden">
        {WORLD_ITEMS.map((w) => (
          <MenuRow
            key={w.id}
            icon={<w.icon size={17} />}
            title={w.name}
            hint={w.hint}
            onClick={() => {
              cancelPlayback();
              useSim.getState().loadWorld(w.id);
              set({ topic: null });
              if (w.id === "lab") useSim.getState().upsertObject({ id: "water", type: "molecule", molecule: "H2O", position: [0, 2.1, 0], rotation: [0, 0, 0], scale: 1, physics: "none", massKg: 1, bounciness: 0, drag: 0, visible: true, version: 0 });
              close();
            }}
          />
        ))}
      </div>

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
      {note && <p className="px-2 pb-2 text-[13px] font-semibold text-ink-2">{note}</p>}
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

      {recent.length > 0 && (
        <>
          <Caption>Recent questions</Caption>
          <div className="group-rows overflow-hidden">
            {recent.map((m) => (
              <MenuRow key={m.id} icon={<Clock size={16} />} title={m.text} hint={ago(m.at)} onClick={() => (set({ draft: m.text }), close())} />
            ))}
          </div>
        </>
      )}

      <div className="group-rows mt-4 overflow-hidden">
        <MenuRow icon={<MessageSquare size={16} />} title="Conversation" hint="Everything you asked and Simu said" onClick={() => set({ transcriptOpen: true, menuOpen: false })} />
      </div>
      <div className="flex gap-4 px-2 pb-1 pt-3 text-[13px] font-semibold text-ink-3">
        <Link href="/credits" className="hover:text-ink">
          About and credits
        </Link>
        <Link href="/privacy" className="hover:text-ink">
          Privacy
        </Link>
      </div>
    </nav>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg grid gap-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} className="min-h-8 truncate px-1 text-[13px]" onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-3">
      <p className="mb-2 text-[15px] font-bold">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}

export function SettingsSheet() {
  const open = useSim((s) => s.settingsOpen);
  const settings = useSim((s) => s.settings);
  const update = useSim((s) => s.updateSettings);
  const set = useSim((s) => s.set);
  if (!open) return null;
  return (
    <div className="glass sheet scroll-thin fixed right-3 top-[64px] z-40 max-h-[calc(100dvh-160px)] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-[22px] p-2 sm:right-6 sm:top-[80px]" role="dialog" aria-label="Settings" style={{ transformOrigin: "top right" }}>
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
        <Field label="Read lines aloud" hint={ttsSupported() ? "Natural Gemini voices, a different one for each character. Captions always show." : "This browser can't play audio. Captions still show."}>
          <Seg label="Read lines aloud" value={settings.voice ? "on" : "off"} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => update({ voice: v === "on" })} />
          {settings.voice && (
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
          )}
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

export function Transcript() {
  const open = useSim((s) => s.transcriptOpen);
  const messages = useSim((s) => s.messages);
  const set = useSim((s) => s.set);
  if (!open) return null;
  return (
    <aside className="glass sheet fixed left-3 top-[64px] z-40 flex max-h-[calc(100dvh-160px)] w-[min(380px,calc(100vw-24px))] flex-col rounded-[22px] p-2 sm:left-6 sm:top-[80px]" aria-label="Conversation" style={{ transformOrigin: "top left" }}>
      <div className="flex items-center px-2 pb-2 pt-1">
        <h2 className="text-[17px] font-extrabold">Conversation</h2>
        <button className="btn btn-quiet ml-auto grid h-8 w-8 place-items-center rounded-full text-ink-2" aria-label="Close conversation" onClick={() => set({ transcriptOpen: false })}>
          <X size={17} />
        </button>
      </div>
      <ol className="scroll-thin flex flex-col gap-1.5 overflow-y-auto px-1 pb-1" aria-live="polite">
        {messages.length === 0 && <li className="px-2 py-1 text-[14px] font-semibold text-ink-3">Your questions and everything Simu says will show up here.</li>}
        {messages.map((m) => (
          <li
            key={m.id}
            className={`max-w-[88%] rounded-[18px] px-3 py-2 text-[14px] font-semibold leading-snug ${m.role === "user" ? "self-end bg-[var(--ink)] text-white" : m.speech ? "bg-white/80 text-ink-2" : "bg-white text-ink"}`}
          >
            {m.text}
          </li>
        ))}
      </ol>
    </aside>
  );
}
