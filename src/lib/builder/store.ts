"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { answerDiscovery, freshWallet, readWallet, unlock, type Wallet } from "./economy";
import type { AssetId } from "../world/catalog";

interface BuilderState {
  open: boolean;
  editing: boolean;
  wallet: Wallet;
  ready: boolean;
  notice: string | null;
  selectedAsset: AssetId;
  set: (patch: Partial<BuilderState>) => void;
  buy: (id: AssetId) => boolean;
  answer: (id: AssetId, choice: number) => { correct: boolean; reward: number };
}
export const useBuilder = create<BuilderState>()(persist((set, get) => ({
  open: false, editing: false, wallet: freshWallet(), ready: false, notice: null, selectedAsset: "domino",
  set,
  buy: id => {
    if (!get().ready) return false;
    const result = unlock(get().wallet, id);
    set({ wallet: result.wallet, notice: result.error ?? null });
    return !result.error;
  },
  answer: (id, choice) => {
    if (!get().ready) return { correct: false, reward: 0 };
    const result = answerDiscovery(get().wallet, id, choice);
    set({ wallet: result.wallet });
    return result;
  },
}), {
  name: "simubox-play-coins-v1", version: 1, skipHydration: true,
  partialize: s => ({ wallet: s.wallet }),
  merge: (saved, current) => ({ ...current, wallet: readWallet((saved as { wallet?: unknown } | null)?.wallet) }),
}));
