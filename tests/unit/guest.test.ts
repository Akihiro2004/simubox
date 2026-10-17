import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
const { countGuestQuestion, guestQuestionsUsed, mustSignIn } = await import("@/lib/guest");

describe("guest question limit", () => {
  it("gives guests one free question, then asks them to sign in", () => {
    expect(mustSignIn(false, true, guestQuestionsUsed())).toBe(false);
    countGuestQuestion();
    expect(guestQuestionsUsed()).toBe(1);
    expect(mustSignIn(false, true, guestQuestionsUsed())).toBe(true);
  });
  it("never blocks signed-in students, or anyone when sign-in isn't available", () => {
    expect(mustSignIn(true, true, 50)).toBe(false);
    expect(mustSignIn(false, false, 50)).toBe(false);
  });
});
