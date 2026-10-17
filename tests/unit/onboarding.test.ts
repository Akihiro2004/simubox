import { beforeEach, describe, expect, it, vi } from "vitest";

const remote = new Map<string, Record<string, unknown>>();
let dbAvailable = true;
let failReads = false;

vi.mock("@/lib/firebase", () => ({ firestore: async () => (dbAvailable ? {} : null) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: async (path: string) => {
    if (failReads) throw new Error("offline");
    const data = remote.get(path);
    return { exists: () => Boolean(data), data: () => data ?? {} };
  },
  setDoc: async (path: string, data: Record<string, unknown>) => void remote.set(path, { ...remote.get(path), ...data }),
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
});

describe("onboarding: first sign-in only", () => {
  it("shows for a new account, then never again once finished", async () => {
    expect(await needsOnboarding("u1")).toBe(true);
    await markOnboarded("u1", prefs);
    expect(await needsOnboarding("u1")).toBe(false);
    expect(remote.get("users/u1/meta/profile")).toMatchObject({ ...prefs, onboardedAt: expect.any(Number) });
  });

  it("follows the account to a new device (flag in Firestore, nothing local)", async () => {
    remote.set("users/u2/meta/profile", { onboardedAt: 1 });
    expect(await needsOnboarding("u2")).toBe(false);
    // ...and remembers it locally, so the next check needs no read.
    failReads = true;
    expect(await needsOnboarding("u2")).toBe(false);
  });

  it("works offline and without Firebase", async () => {
    failReads = true;
    expect(await needsOnboarding("u3")).toBe(true);
    dbAvailable = false;
    await markOnboarded("u3", prefs);
    expect(await needsOnboarding("u3")).toBe(false);
  });

  it("is per account: another student on the same device still gets it", async () => {
    await markOnboarded("u4", prefs);
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
