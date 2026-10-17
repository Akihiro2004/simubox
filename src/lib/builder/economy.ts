import { z } from "zod";
import { DISCOVERIES, DISCOVERY_BY_ID, DISCOVERY_REWARD, STARTER_ASSETS, STARTER_COINS } from "./catalog";
import type { AssetId } from "../world/catalog";

export interface Wallet { coins: number; owned: AssetId[]; earned: AssetId[] }
export const freshWallet = (): Wallet => ({ coins: STARTER_COINS, owned: [...STARTER_ASSETS], earned: [] });
const shopIds = new Set(DISCOVERIES.map(item => item.asset));
const asset = z.custom<AssetId>(v => typeof v === "string" && shopIds.has(v as AssetId));
const WalletData = z.object({ coins: z.number().int().min(0).max(1_000_000), owned: z.array(asset).max(DISCOVERIES.length), earned: z.array(asset).max(DISCOVERIES.length) });

export function readWallet(raw: unknown): Wallet {
  const parsed = WalletData.safeParse(raw);
  return parsed.success ? { ...parsed.data, owned: [...new Set([...STARTER_ASSETS, ...parsed.data.owned])], earned: [...new Set(parsed.data.earned)] } : freshWallet();
}
export function unlock(wallet: Wallet, id: AssetId): { wallet: Wallet; error?: string } {
  const item = DISCOVERY_BY_ID[id];
  if (!item) return { wallet, error: "That item isn't in the shop." };
  if (wallet.owned.includes(id)) return { wallet };
  if (wallet.coins < item.price) return { wallet, error: "Earn more coins by trying a discovery question. There is no payment." };
  return { wallet: { ...wallet, coins: wallet.coins - item.price, owned: [...wallet.owned, id] } };
}
export function answerDiscovery(wallet: Wallet, id: AssetId, choice: number): { wallet: Wallet; correct: boolean; reward: number } {
  const item = DISCOVERY_BY_ID[id];
  const correct = Boolean(item && Number.isInteger(choice) && choice === item.answer);
  if (!correct || wallet.earned.includes(id)) return { wallet, correct, reward: 0 };
  return { wallet: { ...wallet, coins: wallet.coins + DISCOVERY_REWARD, earned: [...wallet.earned, id] }, correct, reward: DISCOVERY_REWARD };
}
