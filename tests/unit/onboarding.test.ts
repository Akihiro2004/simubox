import { beforeEach, describe, expect, it, vi } from "vitest";

// The flag lives on the account and is reached through /api/profile, as the signed-in student.
const remote = new Map<string, Record<string, unknown>>();
let who = "u1";
let dbAvailable = true;
let failReads = false;

vi.mock("@/lib/firebase", () => ({
  accountFetch: async (_path: string, init?: RequestInit) => {
    if (!dbAvailable) return Response.json({ error: "Sign in first." }, { status: 401 });
    const key = `users/${who}/meta/profile`;
    if (init?.method === "POST") {
      remote.set(key, { ...remote.get(key), onboardedAt: Date.now(), ...JSON.parse(String(init.body)) });
      return Response.json({ ok: true });
    }
    if (failReads) throw new Error("offline");
    return Response.json({ onboarded: typeof remote.get(key)?.onboardedAt === "number" });
  },
}));

const local = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => void local.set(k, v),
});

const { markOnboarded, needsOnboarding } = await import("@/lib/onboarding");
const prefs = { gradeBand: "middle", language: "en", voice: true } as const;

beforeEach(() => {
  remote.clear();
  local.clear();
  dbAvailable = true;
  failReads = false;
  who = "u1";
});

describe("onboarding: first sign-in only", () => {
  it("shows for a new account, then never again once finished", async () => {
    expect(await needsOnboarding("u1")).toBe(true);
    await markOnboarded("u1", prefs);
    expect(await needsOnboarding("u1")).toBe(false);
    expect(remote.get("users/u1/meta/profile")).toMatchObject({ ...prefs, onboardedAt: expect.any(Number) });
  });

  it("follows the account to a new device (flag on the account, nothing local)", async () => {
    who = "u2";
    remote.set("users/u2/meta/profile", { onboardedAt: 1 });
    expect(await needsOnboarding("u2")).toBe(false);
    // ...and remembers it locally, so the next check needs no read.
    failReads = true;
    expect(await needsOnboarding("u2")).toBe(false);
  });

  it("works offline and without Firebase", async () => {
    who = "u3";
    failReads = true;
    expect(await needsOnboarding("u3")).toBe(true);
    dbAvailable = false;
    await markOnboarded("u3", prefs);
    expect(await needsOnboarding("u3")).toBe(false);
  });

  it("is per account: another student on the same device still gets it", async () => {
    who = "u4";
    await markOnboarded("u4", prefs);
    who = "u5";
    expect(await needsOnboarding("u5")).toBe(true);
  });
});

describe("firestore rules", () => {
  it("allow only the owner's profile flag with known fields", async () => {
    const { readFileSync } = await import("node:fs");
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toContain("match /users/{uid}/meta/{docId}");
    expect(rules).toContain("d.keys().hasOnly(['onboardedAt', 'gradeBand', 'language', 'voice'])");
  });
});
