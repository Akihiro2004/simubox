import { describe, expect, it } from "vitest";
import { Experiment, Profile } from "@/lib/server/userdata";

// Saves and the welcome flag go through the server (ad blockers block the browser's
// own Firestore connection), so the server's checks must accept what the app sends.
describe("account data checks", () => {
  const save = {
    id: "exp_mfx2k1ab9z",
    title: "Dropping a ball on the Moon",
    world: "space",
    updatedAt: 1793000000000,
    scene: { world: "space", objects: {}, gravity: [0, -1.62, 0] },
    messages: [
      { role: "user", text: "What if I drop a ball on the Moon?" },
      { role: "assistant", text: "It falls slower.", speech: true },
    ],
    plan: null,
    version: 1,
  };

  it("accepts a saved experiment as the app builds it", () => {
    expect(Experiment.safeParse(save).success).toBe(true);
    expect(Experiment.safeParse({ ...save, world: "anatomy" }).success).toBe(true);
  });

  it("refuses ids, worlds and sizes the database rules would refuse", () => {
    expect(Experiment.safeParse({ ...save, id: "../other-user" }).success).toBe(false);
    expect(Experiment.safeParse({ ...save, world: "nowhere" }).success).toBe(false);
    expect(Experiment.safeParse({ ...save, title: "" }).success).toBe(false);
    expect(Experiment.safeParse({ ...save, messages: Array(41).fill(save.messages[0]) }).success).toBe(false);
  });

  it("accepts the welcome choices", () => {
    expect(Profile.safeParse({ gradeBand: "middle", language: "id", voice: true }).success).toBe(true);
    expect(Profile.safeParse({ gradeBand: "college" }).success).toBe(false);
  });

  it("refuses anonymous calls", async () => {
    const { GET } = await import("@/app/api/experiments/route");
    expect((await GET(new Request("https://simubox.test/api/experiments"))).status).toBe(401);
    const profile = await import("@/app/api/profile/route");
    expect((await profile.GET(new Request("https://simubox.test/api/profile"))).status).toBe(401);
  });
});
