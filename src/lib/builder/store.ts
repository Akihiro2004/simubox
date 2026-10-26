"use client";

import { create } from "zustand";
import { freshWallet, type LedgerEntry, type Order, type Wallet } from "./economy";
import { idToken, initFirebase } from "../firebase";
import type { AssetId } from "../world/catalog";

/** The server's view of this learner's account (see /api/credits). */
export interface AccountView extends Wallet { history: LedgerEntry[]; orders: Order[]; signedIn: boolean; payments?: "creem" | "sandbox" }

interface BuilderState {
  open: boolean;
  editing: boolean;
  /** A copy of the server's balance and unlocks; the server decides every change. */
  wallet: Wallet;
  account: AccountView | null;
  ready: boolean;
  notice: string | null;
  selectedAsset: AssetId;
  set: (patch: Partial<BuilderState>) => void;
  buy: (id: AssetId) => Promise<boolean>;
  answer: (id: AssetId, choice: number) => Promise<{ correct: boolean; reward: number }>;
}

type Reply = { error?: string; code?: string; correct?: boolean; reward?: number; order?: Order; checkoutUrl?: string; account?: AccountView };

export async function creditsApi(body?: object): Promise<Reply> {
  await initFirebase();
  const token = await idToken();
  const res = await fetch("/api/credits", {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({ error: "Can't reach SimuBox right now." }))) as Reply;
  // GET answers with the account itself.
  return body ? data : res.ok ? { account: data as unknown as AccountView } : { error: data.error ?? "Your balance can't be loaded right now." };
}

export function applyAccount(account: AccountView | undefined) {
  if (account?.owned) useBuilder.setState({ account, wallet: { credits: account.credits, owned: account.owned, earned: account.earned } });
}

/** The balance after a lesson was paid for, without another round trip. */
export function setCredits(credits: number) {
  const s = useBuilder.getState();
  useBuilder.setState({ wallet: { ...s.wallet, credits }, account: s.account && { ...s.account, credits } });
}

export async function refreshWallet() {
  try {
    applyAccount((await creditsApi()).account);
  } finally {
    useBuilder.setState({ ready: true });
  }
}

export const useBuilder = create<BuilderState>()((set, get) => ({
  open: false, editing: false, wallet: freshWallet(), account: null, ready: false, notice: null, selectedAsset: "domino",
  set,
  buy: async id => {
    if (!get().ready) return false;
    const r = await creditsApi({ action: "unlock", asset: id });
    applyAccount(r.account);
    set({ notice: r.code === "sign_in" ? "Sign in to unlock items with credits." : r.error ?? null });
    return !r.error;
  },
  answer: async (id, choice) => {
    if (!get().ready) return { correct: false, reward: 0 };
    const r = await creditsApi({ action: "discovery", asset: id, choice });
    applyAccount(r.account);
    return { correct: Boolean(r.correct), reward: r.reward ?? 0 };
  },
}));
