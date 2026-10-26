import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.hoisted(() => {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), clear: () => data.clear() } });
});

import { ASSETS, LIMITS, WORLD_IDS, WORLDS } from "@/lib/world/catalog";
import { assetObject, initialObjects } from "@/lib/world/scene";
import { LEARNING_ASSETS, LEARNING_PARTS } from "@/lib/world/learning-assets";
import { DISCOVERIES, DISCOVERY_REWARD } from "@/lib/builder/catalog";
import { answerDiscovery, freshAccount, readAccount, unlock } from "@/lib/builder/economy";
import { SIGNUP_BONUS } from "@/lib/credits";
import { mapSummaries, parseLayout, readMaps, writeMap } from "@/lib/builder/maps";
import { boundPosition, findPlacement } from "@/lib/builder/placement";
import { beginEditing, duplicateObject, editObject, finishEditing, placeAsset, removeFromMap, undoEdit, useEditHistory } from "@/lib/builder/actions";
import { useBuilder } from "@/lib/builder/store";
import { freshScene, snapshot, useSim } from "@/lib/store";
import { validatePlan } from "@/lib/ssp/validate";
import { FIXTURES } from "@/lib/ai/fixtures";
import { createStepStreamer } from "@/lib/ssp/stream";
import { saveExperiment, restoreExperiment } from "@/lib/saves";

beforeEach(() => {
  localStorage.clear();
  useSim.setState({ ...freshScene("stage"), messages: [], experimentId: null, lastPlan: null, selectedId: null, aiStatus: "idle" });
  useBuilder.setState({ wallet: { credits: SIGNUP_BONUS, owned: freshAccount(0, "x").owned, earned: [] }, ready: true, editing: false, open: false });
  useEditHistory.setState({ past: [], future: [] });
});

describe("learning asset contract", () => {
  it("ships a small, pre-rendered PNG thumbnail for every shop asset", () => {
    let bytes = 0;
    for (const item of DISCOVERIES) {
      const png = readFileSync(fileURLToPath(new URL(`../../public/asset-thumbnails/${item.asset}.png`, import.meta.url)));
      expect(png.subarray(1, 4).toString()).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(192);
      expect(png.readUInt32BE(20)).toBe(144);
      bytes += png.length;
    }
    expect(bytes).toBeLessThan(500_000);
  });
  it("gives every asset a unique catalog entry and keeps render/collider parts inside its bounds", () => {
    for (const [id, def] of Object.entries(LEARNING_ASSETS)) {
      expect(ASSETS).toHaveProperty(id);
      expect(def.massKg).toBeGreaterThan(0);
      for (const part of LEARNING_PARTS[id as keyof typeof LEARNING_PARTS]) for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(part.position[axis]) + part.size[axis] / 2, `${id}, axis ${axis}`).toBeLessThanOrEqual(def.size[axis] / 2 + .001);
      }
    }
    expect(ASSETS.cork_block.massKg / (.4 ** 3)).toBeCloseTo(240);
    expect(ASSETS.steel_block.massKg / (.4 ** 3)).toBeCloseTo(7850);
  });
  it("leaves the bridge opening clear for balls and planks", () => {
    expect(LEARNING_PARTS.bridge_arch.every(p => Math.abs(p.position[0]) >= .5 || p.position[1] - p.size[1] / 2 >= .4)).toBe(true);
  });
  it("has complete learning cards, explicitly labelled illustrative instruments, and enough rewards to unlock everything", () => {
    expect(new Set(DISCOVERIES.map(d => d.asset)).size).toBe(DISCOVERIES.length);
    for (const item of DISCOVERIES) {
      expect(item.answer).toBeGreaterThanOrEqual(0); expect(item.answer).toBeLessThan(item.choices.length);
      expect(item.explanation.length).toBeGreaterThan(40);
      expect(item.tryIt.length).toBeGreaterThan(30);
      if (ASSETS[item.asset].tags.includes("illustration")) expect(item.illustration).toBeTruthy();
    }
    // Free credits alone never unlock the whole shop.
    expect(SIGNUP_BONUS + DISCOVERIES.length * DISCOVERY_REWARD).toBeLessThan(DISCOVERIES.reduce((sum, item) => sum + item.price, 0));
  });
});

describe("credit ownership", () => {
  it("charges exactly once for a reusable unlock and rejects insufficient funds", () => {
    const w = freshAccount(SIGNUP_BONUS, "test");
    const purchase = unlock(w, "marble");
    expect(purchase.account.credits).toBe(w.credits - DISCOVERIES.find(d => d.asset === "marble")!.price);
    expect(purchase.account.history[0].amount).toBeLessThan(0);
    expect(unlock(purchase.account, "marble").account).toBe(purchase.account);
    expect(unlock({ ...w, credits: 0 }, "marble").error).toBeTruthy();
    expect(w.owned).not.toContain("marble");
  });
  it("rewards a correct discovery once, without charging for mistakes or requiring ownership", () => {
    const item = DISCOVERIES.find(d => d.asset === "marble")!, w = freshAccount(SIGNUP_BONUS, "test");
    expect(answerDiscovery(w, item.asset, -1)).toMatchObject({ account: w, correct: false, reward: 0 });
    expect(answerDiscovery(w, item.asset, (item.answer + 1) % 3).account).toBe(w);
    const good = answerDiscovery(w, item.asset, item.answer);
    expect(good.reward).toBe(DISCOVERY_REWARD);
    expect(good.account.credits).toBe(w.credits + DISCOVERY_REWARD);
    expect(answerDiscovery(good.account, item.asset, item.answer).reward).toBe(0);
    expect(good.account.owned).not.toContain(item.asset);
  });
  it("rejects malformed stored accounts and deduplicates ownership", () => {
    expect(readAccount({ credits: -9, owned: ["does_not_exist"] })).toBeNull();
    expect(readAccount({ ...freshAccount(0, "x"), credits: Infinity })).toBeNull();
    const w = readAccount({ credits: 10, owned: ["marble", "marble"], earned: ["marble", "marble"] })!;
    expect(w.owned.filter(id => id === "marble")).toHaveLength(1);
    expect(w.earned).toEqual(["marble"]);
    expect(w.owned).toContain("domino");
  });
});

describe("map layouts and safe placement", () => {
  it.each(WORLD_IDS)("places a small physical prop inside %s and outside existing furniture", world => {
    const o = assetObject("test_marble", "marble", [0, 0, 0]);
    const at = findPlacement(o, world, Object.fromEntries(initialObjects(world).map(obj => [obj.id, obj])));
    expect(at).not.toBeNull();
    at!.forEach((v, axis) => { expect(v).toBeGreaterThanOrEqual(WORLDS[world].bounds.min[axis]); expect(v).toBeLessThanOrEqual(WORLDS[world].bounds.max[axis]); });
  });
  it("clamps rotated objects, rejects invalid values and rejects items too large to fit", () => {
    const o = assetObject("plank", "wooden_plank", [0, 1, 0], { rotation: [0, 90, 0] });
    expect(boundPosition(o, "bedroom", [100, 1, 100])).toEqual([3.625, 1, 3.05]);
    expect(boundPosition(o, "bedroom", [NaN, 1, 1])).toBeNull();
    expect(boundPosition({ ...o, scale: 100 }, "bedroom", [0, 1, 0])).toBeNull();
  });
  it("validates map ids, object types, bounds and corruption before loading", () => {
    const object = assetObject("build_domino_123", "domino", [0, .325, 0], { learnerPlaced: true });
    const map = { version: 1 as const, world: "stage" as const, objects: { [object.id]: object } };
    expect(writeMap(map)).toBe(true);
    expect(readMaps().stage?.objects[object.id]).toEqual(object);
    expect(mapSummaries()).toEqual([{ world: "stage", ids: [object.id] }]);
    expect(parseLayout({ ...map, objects: { wrong_id: object } })).toBeNull();
    expect(parseLayout({ ...map, objects: { [object.id]: { ...object, asset: "bad" } } })).toBeNull();
    expect(parseLayout({ ...map, objects: { [object.id]: { ...object, position: [100, 0, 0] } } })).toBeNull();
    localStorage.setItem("simubox-builder-maps-v1", "not JSON");
    expect(readMaps()).toEqual({});
  });
  it("handles browsers that block access to localStorage", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")!;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("Storage blocked"); } });
    try {
      expect(readMaps()).toEqual({});
      expect(writeMap({ version: 1, world: "stage", objects: {} })).toBe(false);
    } finally { Object.defineProperty(globalThis, "localStorage", descriptor); }
  });
});

describe("editor, persistence and AI integration", () => {
  it("preserves ids through editing, duplication, undo/redo, world reload and experiment saves", async () => {
    const id = placeAsset("domino")!;
    expect(id).toMatch(/^[a-z][a-z0-9_]{0,31}$/);
    expect(editObject(id, { label: "First domino", position: [1, .325, 1], color: "#668877" })).toBe(true);
    const second = duplicateObject(id)!;
    expect(second).not.toBe(id);
    expect(useSim.getState().objects[second].label).toBe("First domino");
    removeFromMap(second);
    expect(useSim.getState().objects[second]).toBeUndefined();
    undoEdit(); expect(useSim.getState().objects[second]).toBeDefined();
    undoEdit(true); expect(useSim.getState().objects[second]).toBeUndefined();
    finishEditing();
    useSim.getState().loadWorld("bedroom");
    useSim.getState().loadWorld("stage");
    expect(useSim.getState().objects[id].label).toBe("First domino");
    expect(snapshot(useSim.getState()).objects[0]).toMatchObject({ id, learnerPlaced: true });
    const exp = await saveExperiment("My learning map");
    useSim.getState().loadWorld("bedroom"); restoreExperiment(exp);
    expect(useSim.getState().objects[id].color).toBe("#668877");
    expect(useBuilder.getState().wallet.owned).toContain("domino");
  });
  it("does not charge on placement, blocks locked assets, and reserves room for teaching props", () => {
    expect(placeAsset("marble")).toBeNull();
    const before = useBuilder.getState().wallet.credits;
    placeAsset("domino"); placeAsset("domino");
    expect(useBuilder.getState().wallet.credits).toBe(before);
    const objects = Object.fromEntries(Array.from({ length: LIMITS.maxObjects - 4 }, (_, i) => [`piece_${i}`, assetObject(`piece_${i}`, "domino", [0, .325, 0])]));
    useSim.setState({ objects });
    expect(placeAsset("domino")).toBeNull();
  });
  it("allows existing furniture to be edited and restores the authored position on reset", () => {
    useSim.getState().loadWorld("bedroom"); beginEditing();
    expect(editObject("chair", { position: [1, .5, 1], rotation: [0, 90, 0] })).toBe(true);
    useSim.getState().patchObject("chair", { position: [2, .5, 2] });
    useSim.getState().resetSimulation();
    expect(useSim.getState().objects.chair.position).toEqual([1, .5, 1]);
  });
  it("validates custom IDs after load_world, drops deleted template IDs, and streams the same commands", () => {
    const id = placeAsset("domino")!;
    useSim.getState().loadWorld("bedroom");
    const scene = snapshot(useSim.getState());
    const plan = { ...FIXTURES.gravity, steps: [{ title: "Use the student's build", commands: [{ op: "load_world", world: "stage" }, { op: "move_object", id, position: [1, .325, 1] }, { op: "move_object", id: "desk", position: [0, 1, 0] }] }] };
    const result = validatePlan(plan, scene);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.plan.steps[0].commands).toHaveLength(2);
    const streamer = createStepStreamer(scene, "en");
    const events = streamer.feed(JSON.stringify(plan));
    expect(events.some(e => e.type === "plan_step")).toBe(true);
    expect(streamer.played()?.steps[0].commands).toEqual(result.plan.steps[0].commands);
  });
});
