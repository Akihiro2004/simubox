"use client";

import { Copy, Eye, EyeOff, Focus, Lock, MessageCircle, Paintbrush, Play, Plus, Redo2, Save, Trash2, Undo2, Unlock } from "lucide-react";
import { useState } from "react";
import { useSim } from "@/lib/store";
import { ASSETS, WORLDS, type Vec3 } from "@/lib/world/catalog";
import { objectName, type SceneObject } from "@/lib/world/scene";
import { DISCOVERY_BY_ID } from "@/lib/builder/catalog";
import { duplicateObject, editObject, finishEditing, removeFromMap, saveWorkingMap, undoEdit, useEditHistory } from "@/lib/builder/actions";
import { halfBounds } from "@/lib/builder/placement";
import { useBuilder } from "@/lib/builder/store";
import { livePosition } from "@/lib/world/runtime";
import styles from "./styles";

function Transform({ o }: { o: SceneObject }) {
  const world = useSim(s => s.world);
  const half = halfBounds(o);
  const axes = ["X", "Height", "Z"];
  return <>
    <label className={styles.field}>Name<input aria-label="Object name" value={o.label ?? objectName(o)} maxLength={40} onChange={e => editObject(o.id, { label: e.target.value })} /></label>
    <div className={styles.positionInputs}>{axes.map((label, axis) => <label key={label} className={styles.field}>{label} (m)<input aria-label={`${label} position`} type="number" step="0.1" min={WORLDS[world].bounds.min[axis] + half[axis]} max={WORLDS[world].bounds.max[axis] - half[axis]} value={Number(o.position[axis].toFixed(2))} onChange={e => { if (!e.target.value.trim()) return; const p = [...o.position] as Vec3; p[axis] = Number(e.target.value); editObject(o.id, { position: p }); }} /></label>)}</div>
    <label className={styles.field}>Turn ({Math.round(o.rotation[1])}°)<input aria-label="Object rotation" type="range" min="-180" max="180" step="15" value={o.rotation[1]} onChange={e => editObject(o.id, { rotation: [o.rotation[0], Number(e.target.value), o.rotation[2]] })} /></label>
    <label className={styles.field}>Size ({o.scale.toFixed(1)}×)<input aria-label="Object scale" type="range" min="0.2" max="3" step="0.1" value={o.scale} onChange={e => editObject(o.id, { scale: Number(e.target.value) })} /></label>
    <div className={styles.objectTools}><label className={styles.color}><Paintbrush size={16} /> Colour<input aria-label="Object colour" type="color" value={o.color ?? (o.type === "asset" ? ASSETS[o.asset].color : "#729e96")} onChange={e => editObject(o.id, { color: e.target.value })} /></label>
      {o.physics !== "none" && <button className={styles.smallButton} aria-pressed={o.physics === "static"} onClick={() => editObject(o.id, { physics: o.physics === "static" ? "dynamic" : "static" })}>{o.physics === "static" ? <Lock size={15} /> : <Unlock size={15} />} {o.physics === "static" ? "Pinned" : "Falls & moves"}</button>}
    </div>
  </>;
}

export default function Editor() {
  const objects = useSim(s => s.objects);
  const selected = useSim(s => s.selectedId);
  const world = useSim(s => s.world);
  const set = useBuilder(s => s.set);
  const notice = useBuilder(s => s.notice);
  const past = useEditHistory(s => s.past.some(e => e.world === world));
  const future = useEditHistory(s => s.future.some(e => e.world === world));
  const [list, setList] = useState(false);
  const o = selected ? objects[selected] : null;
  const item = o?.type === "asset" ? DISCOVERY_BY_ID[o.asset] : null;
  return <section data-map-editing="true" className={styles.editor} aria-label="Map editor">
    <header className={styles.editorHeader}><div><div className={styles.eyebrow}>MAKE IT YOURS</div><h2>Map studio</h2></div><button className={styles.playButton} onClick={finishEditing}><Play size={15} /> Play</button></header>
    <div className={styles.editorToolbar}>
      <button aria-label="Undo map edit" disabled={!past} onClick={() => undoEdit()}><Undo2 size={18} /></button>
      <button aria-label="Redo map edit" disabled={!future} onClick={() => undoEdit(true)}><Redo2 size={18} /></button>
      <button aria-label="Save working map" onClick={saveWorkingMap}><Save size={18} /></button>
      <button aria-label="View map from above" onClick={() => useSim.getState().focus({ preset: "top" })}><Focus size={18} /></button>
      <button className={styles.addButton} onClick={() => set({ open: true })}><Plus size={16} /> Add item</button>
    </div>
    <div className={styles.editorScroll}>
      <button className={styles.objectListToggle} aria-expanded={list} onClick={() => setList(!list)}>Objects in this world <span>{Object.keys(objects).length} / 40</span></button>
      {list && <div className={styles.objectList}>{Object.values(objects).map(obj => <button key={obj.id} aria-pressed={obj.id === selected} onClick={() => useSim.getState().set({ selectedId: obj.id })}>{objectName(obj)}<small>{obj.id}</small></button>)}</div>}
      {o ? <div className={styles.objectEditor} key={o.id}>
        <h3>{objectName(o)}</h3><p className={styles.instanceId}>AI ID <code>{o.id}</code></p>
        <Transform o={o} />
        <div className={styles.objectTools}>
          <button className={styles.smallButton} aria-label="Duplicate object" onClick={() => duplicateObject(o.id)}><Copy size={15} /> Copy</button>
          <button className={styles.smallButton} aria-label={o.visible ? "Hide object" : "Show object"} onClick={() => editObject(o.id, { visible: !o.visible })}>{o.visible ? <EyeOff size={15} /> : <Eye size={15} />}{o.visible ? "Hide" : "Show"}</button>
          <button className={styles.smallButton} aria-label="Remove object from map" onClick={() => removeFromMap(o.id)}><Trash2 size={15} /> Remove</button>
        </div>
        <button className={styles.askButton} onClick={() => {
          const id = o.id, name = objectName(o);
          finishEditing();
          useSim.getState().set({ draft: `Using my ${name} (id: ${id}), ${item ? item.tryIt.charAt(0).toLowerCase() + item.tryIt.slice(1) : "help me plan a learning experiment."}` });
          const p = livePosition(id); if (p) useSim.getState().focus({ target: p, zoom: "medium" });
          document.getElementById("prompt")?.focus();
        }}><MessageCircle size={16} /> Explore with Simu</button>
        {item && <p className={styles.editorTip}>{item.illustration ?? item.tryIt}</p>}
      </div> : <p className={styles.editorTip}>Choose an object in the world or the list above. Drag it to move, or use precise position controls. Physics is paused while you build.</p>}
      <p className={styles.notice} role="status">{notice}</p>
    </div>
  </section>;
}
