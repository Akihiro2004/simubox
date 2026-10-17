"use client";

import { create } from "zustand";
import { Euler, Quaternion } from "three";
import { stopAsking } from "../ask";
import { useSim } from "../store";
import { ASSETS, LIMITS, type AssetId, type Vec3, type WorldId } from "../world/catalog";
import { assetObject, type SceneObject } from "../world/scene";
import { getBody, livePosition, markFresh } from "../world/runtime";
import { boundPosition, findPlacement } from "./placement";
import { readMaps, writeMap, type MapLayout } from "./maps";
import { useBuilder } from "./store";
import { DISCOVERY_BY_ID } from "./catalog";

interface Edit { world: WorldId; objects: Record<string, SceneObject> }
export const useEditHistory = create<{ past: Edit[]; future: Edit[] }>(() => ({ past: [], future: [] }));
const clone = <T,>(v: T): T => structuredClone(v);
let wasPaused = false;
const notice = (text: string | null) => useBuilder.getState().set({ notice: text });

/** Freeze live transforms into plain scene data, with positions constrained to this world's bounds. */
export function captureMap(): MapLayout {
  const s = useSim.getState();
  const objects = clone(s.objects);
  for (const [id, o] of Object.entries(objects)) {
    const b = getBody(id);
    if (b) {
      const q = b.rotation();
      const r = new Euler().setFromQuaternion(new Quaternion(q.x, q.y, q.z, q.w));
      o.rotation = [r.x, r.y, r.z].map(v => v * 180 / Math.PI) as Vec3;
    }
    const p = livePosition(id) ?? o.position;
    o.position = boundPosition(o, s.world, p) ?? o.position;
  }
  return { version: 1, world: s.world, objects };
}

export function saveWorkingMap(): boolean {
  const ok = writeMap(captureMap());
  notice(ok ? "Map kept in this browser. Use Save experiment in the menu for an experiment copy." : "Browser storage is unavailable or this map is too large. Use Save experiment in the menu to keep a copy.");
  return ok;
}
export function beginEditing() {
  stopAsking();
  if (!useBuilder.getState().editing) wasPaused = useSim.getState().paused;
  useSim.getState().set({ paused: true, menuOpen: false, settingsOpen: false, transcriptOpen: false });
  useBuilder.getState().set({ editing: true, open: false, notice: null });
}
export function finishEditing() {
  saveWorkingMap();
  useSim.getState().set({ paused: wasPaused });
  useBuilder.getState().set({ editing: false });
}
export function rememberEdit() {
  const { world, objects } = captureMap();
  useEditHistory.setState(s => ({ past: [...s.past.filter(e => e.world === world).slice(-19), { world, objects }], future: [] }));
}
function changed() {
  const ok = writeMap(captureMap());
  if (!ok) notice("Your changes work here, but browser storage is unavailable. Save an experiment to keep them.");
}
export function undoEdit(redo = false) {
  const s = useSim.getState();
  const h = useEditHistory.getState();
  const from = (redo ? h.future : h.past).filter(e => e.world === s.world);
  const target = from.at(-1);
  if (!target) return;
  const now = { world: s.world, objects: captureMap().objects };
  useEditHistory.setState(redo ? { past: [...h.past.filter(e => e.world === s.world), now], future: from.slice(0, -1) } : { past: from.slice(0, -1), future: [...h.future.filter(e => e.world === s.world), now] });
  s.set({ objects: clone(target.objects), worldNonce: s.worldNonce + 1, selectedId: null, paused: true });
  changed();
}

function instanceId(asset: string) {
  let id: string;
  do { id = `build_${asset.slice(0, 12)}_${crypto.randomUUID().slice(0, 8)}`; }
  while (useSim.getState().objects[id] || useSim.getState().characters[id]);
  return id;
}
export function placeAsset(id: AssetId): string | null {
  if (!useBuilder.getState().ready || !useBuilder.getState().wallet.owned.includes(id)) { notice("Unlock this item before placing it."); return null; }
  const s = useSim.getState();
  if (Object.keys(s.objects).length >= LIMITS.maxObjects - 4) { notice("This map is getting full. Remove a few objects to leave room for Simu's lessons."); return null; }
  const o = assetObject(instanceId(id), id, [0, 0, 0], { learnerPlaced: true });
  const p = findPlacement(o, s.world, captureMap().objects);
  if (!p) { notice("No clear space for this item. Move or remove something, or try the blank stage."); return null; }
  beginEditing();
  rememberEdit();
  markFresh(o.id);
  s.upsertObject({ ...o, position: p });
  s.set({ selectedId: o.id });
  changed();
  notice(`${ASSETS[id].name} placed. Drag to move, or use the editor for precise positioning.`);
  return o.id;
}

export function editObject(id: string, patch: Partial<Pick<SceneObject, "position" | "rotation" | "scale" | "color" | "physics" | "label" | "visible">>, record = true): boolean {
  const s = useSim.getState();
  const old = s.objects[id];
  if (!old || !useBuilder.getState().editing) return false;
  const next = { ...old, ...patch };
  if (next.scale < .2 || next.scale > 3 || !Number.isFinite(next.scale) || (next.color && !/^#[a-f0-9]{6}$/i.test(next.color)) || (next.label?.length ?? 0) > 40) return false;
  const position = boundPosition(next, s.world, patch.position ?? livePosition(id) ?? old.position);
  if (!position) { notice("That size or rotation does not fit in this world."); return false; }
  if (record) rememberEdit();
  const scaleRatio = next.scale / old.scale;
  s.patchObject(id, { ...patch, position, massKg: Math.min(10000, old.massKg * scaleRatio ** 3), version: old.version + 1 });
  if (record) changed();
  return true;
}
export function removeFromMap(id: string) {
  if (!useSim.getState().objects[id] || !useBuilder.getState().editing) return;
  rememberEdit();
  useSim.getState().removeObject(id);
  changed();
  notice("Removed from the map. Unlocked items stay in your collection.");
}
export function duplicateObject(id: string): string | null {
  const s = useSim.getState(), old = s.objects[id];
  if (!old || !useBuilder.getState().editing) return null;
  if (old.type === "asset" && DISCOVERY_BY_ID[old.asset] && !useBuilder.getState().wallet.owned.includes(old.asset)) {
    useBuilder.getState().set({ open: true, selectedAsset: old.asset, notice: "Unlock this item in the shop to place more copies." });
    return null;
  }
  if (Object.keys(s.objects).length >= LIMITS.maxObjects - 4) { notice("Remove an object before making more copies."); return null; }
  const next = { ...clone(old), id: instanceId(old.type === "asset" ? old.asset : old.type), learnerPlaced: true, version: 0 };
  const p = findPlacement(next, s.world, captureMap().objects);
  if (!p) { notice("No clear space for another copy."); return null; }
  rememberEdit();
  s.upsertObject({ ...next, position: p });
  s.set({ selectedId: next.id });
  changed();
  return next.id;
}

export function restoreWorkingMap() {
  const s = useSim.getState(), saved = readMaps()[s.world];
  if (!saved) return;
  s.set({ objects: clone(saved.objects), worldNonce: s.worldNonce + 1, selectedId: null });
}

/** One history entry for a pointer gesture, persisted only when it finishes. */
export function finishMapDrag() { changed(); }
