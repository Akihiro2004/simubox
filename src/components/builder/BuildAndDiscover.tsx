"use client";

import dynamic from "next/dynamic";
import { Blocks, Coins, PencilRuler } from "lucide-react";
import { useEffect } from "react";
import { refreshWallet, useBuilder } from "@/lib/builder/store";
import { useAuth } from "@/lib/firebase";
import { beginEditing, restoreWorkingMap, useEditHistory } from "@/lib/builder/actions";
import { useSim } from "@/lib/store";
import { stopAsking } from "@/lib/ask";
import styles from "./styles";

const Shop = dynamic(() => import("./shop"), { ssr: false, loading: () => <div className="glass fixed bottom-24 left-6 z-50 rounded-2xl px-4 py-3 text-sm font-bold" role="status">Opening your collection…</div> });
const Editor = dynamic(() => import("./editor"), { ssr: false });

export default function BuildAndDiscover() {
  const open = useBuilder(s => s.open), editing = useBuilder(s => s.editing), credits = useBuilder(s => s.wallet.credits), ready = useBuilder(s => s.ready), set = useBuilder(s => s.set);
  useEffect(() => {
    let alive = true;
    void refreshWallet().finally(() => {
      if (alive && !useSim.getState().messages.length) restoreWorkingMap();
    });
    // Signing in or out switches to that account's credits.
    const offAuth = useAuth.subscribe((a, prev) => { if (a.user?.uid !== prev.user?.uid) void refreshWallet(); });
    let world = useSim.getState().world;
    const off = useSim.subscribe(s => {
      if (s.world === world) return;
      world = s.world;
      useEditHistory.setState({ past: [], future: [] });
      if (useBuilder.getState().editing) s.set({ paused: true });
    });
    // Warm split UI chunks while idle, rather than doing that work on the first click.
    const warm = () => { void Promise.all([import("./shop"), import("./editor"), import("./asset-preview")]).catch(() => {}); };
    const idle = window.requestIdleCallback ? window.requestIdleCallback(warm, { timeout: 3000 }) : null;
    const timer = idle === null ? window.setTimeout(warm, 1500) : null;
    return () => { alive = false; off(); offAuth(); if (idle !== null) window.cancelIdleCallback(idle); if (timer !== null) window.clearTimeout(timer); };
  }, []);
  return <>
    {!editing ? <div className={styles.launcher}>
      <button disabled={!ready} className={styles.shopLaunch} onPointerEnter={() => { void import("./shop"); }} onFocus={() => { void import("./shop"); }} onClick={() => { stopAsking(); useSim.getState().set({ menuOpen: false, settingsOpen: false, transcriptOpen: false }); set({ open: true, notice: null }); }}><Blocks size={18} /><span>Build & Discover</span><span className={styles.launchCoins} aria-label={`${credits} credits`}><Coins size={13} />{credits}</span></button>
      <button disabled={!ready} className={styles.editLaunch} aria-label="Edit map" onClick={beginEditing}><PencilRuler size={18} /></button>
    </div> : <Editor />}
    {open && <Shop />}
  </>;
}
