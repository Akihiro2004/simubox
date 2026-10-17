"use client";

import dynamic from "next/dynamic";
import { Check, Coins, Search, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ASSETS } from "@/lib/world/catalog";
import { CATEGORIES, DISCOVERIES, DISCOVERY_BY_ID, DISCOVERY_REWARD, type Category, type Discovery } from "@/lib/builder/catalog";
import { useBuilder } from "@/lib/builder/store";
import { placeAsset } from "@/lib/builder/actions";
import { AssetThumb } from "./asset-thumb";
import styles from "./styles";

const AssetPreview = dynamic(() => import("./asset-preview"), { ssr: false, loading: () => <div className="grid h-full place-items-center text-sm text-ink-2">Preparing 3D preview…</div> });

function DiscoveryQuestion({ item }: { item: Discovery }) {
  const earned = useBuilder(s => s.wallet.earned.includes(item.asset));
  const answer = useBuilder(s => s.answer);
  const [result, setResult] = useState<{ picked: number; correct: boolean; reward: number } | null>(null);
  return <section className={styles.discovery} aria-label="Discovery question">
    <div className={styles.eyebrow}><Sparkles size={14} /> {earned ? "Discovery complete" : `Discover & earn ${DISCOVERY_REWARD} coins`}</div>
    <h3>{item.question}</h3>
    <div className={styles.answers}>{item.choices.map((choice, i) => <button key={choice} className={result?.picked === i ? result.correct ? styles.correct : styles.incorrect : ""} disabled={earned} onClick={() => setResult({ picked: i, ...answer(item.asset, i) })}>{earned && item.answer === i && <Check size={15} />} {choice}</button>)}</div>
    <div aria-live="polite">{(result || earned) && <p className={styles.feedback}>{result && !result.correct ? "Good prediction. Try another answer. " : result?.reward ? `You earned ${result.reward} coins. ` : "You already earned these coins. "}{item.explanation}</p>}</div>
  </section>;
}

export default function Shop() {
  const dialog = useRef<HTMLDialogElement>(null);
  const selected = useBuilder(s => s.selectedAsset);
  const set = useBuilder(s => s.set);
  const wallet = useBuilder(s => s.wallet);
  const buy = useBuilder(s => s.buy);
  const ready = useBuilder(s => s.ready);
  const notice = useBuilder(s => s.notice);
  const [category, setCategory] = useState<Category | "All">("All");
  const [collection, setCollection] = useState(false);
  const [search, setSearch] = useState("");
  const item = DISCOVERY_BY_ID[selected] ?? DISCOVERIES[0];
  const owned = wallet.owned.includes(item.asset);
  const close = () => set({ open: false });
  useEffect(() => {
    const el = dialog.current;
    const previous = document.activeElement;
    el?.showModal();
    return () => { el?.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const items = DISCOVERIES.filter(d => (category === "All" || d.category === category) && (!collection || wallet.owned.includes(d.asset)) && `${ASSETS[d.asset].name} ${d.tagline} ${d.category} ${ASSETS[d.asset].tags.join(" ")}`.toLowerCase().includes(search.toLowerCase()));

  return <dialog ref={dialog} aria-labelledby="asset-shop-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} className={styles.dialog}>
    <div className={styles.shop}>
      <header className={styles.shopHeader}>
        <div><div className={styles.eyebrow}>YOUR WORLD, YOUR IDEAS</div><h2 id="asset-shop-title">Build & Discover</h2><p>A little curiosity. A world of possibilities.</p></div>
        <div className={styles.headerTools}><span className={styles.coinBalance} aria-label={`${wallet.coins} play coins`}><Coins size={18} /> <strong>{wallet.coins}</strong></span><button className={styles.iconButton} aria-label="Close asset shop" onClick={close}><X size={20} /></button></div>
      </header>
      <div className={styles.shopBody}>
        <section className={styles.catalog} aria-label="Asset catalog">
          <div className={styles.catalogTools}>
            <div className={styles.tabs}><button aria-pressed={!collection} onClick={() => setCollection(false)}>Discover</button><button aria-pressed={collection} onClick={() => setCollection(true)}>My collection <span>{wallet.owned.length}</span></button></div>
            <label className={styles.search}><Search size={16} /><input type="search" aria-label="Search assets" placeholder="Find your next idea…" value={search} onChange={e => setSearch(e.target.value)} /></label>
            <div className={styles.categories} aria-label="Asset categories">{(["All", ...CATEGORIES] as const).map(c => <button key={c} aria-pressed={c === category} onClick={() => setCategory(c)}>{c}</button>)}</div>
          </div>
          <div className={styles.assetGrid}>{items.map(d => <button key={d.asset} data-asset-id={d.asset} className={styles.assetCard} aria-label={`View ${ASSETS[d.asset].name}`} aria-pressed={item.asset === d.asset} onClick={() => set({ selectedAsset: d.asset, notice: null })}>
            <div className={styles.thumbnail}><AssetThumb item={d} /></div><strong>{ASSETS[d.asset].name}</strong><span>{wallet.owned.includes(d.asset) ? <><Check size={12} /> In collection</> : <><Coins size={12} /> {d.price}</>}</span>
          </button>)}</div>
          {!items.length && <p className={styles.empty}>No items here yet. Try another category or search.</p>}
          <p className={styles.localNote}>Play coins only. No payments. Your coins and collection stay in this browser.</p>
        </section>
        <aside className={styles.itemDetails} aria-label="Selected asset">
          <div className={styles.preview}><AssetPreview asset={item.asset} /><span>{item.illustration ? "Illustration" : ASSETS[item.asset].defaultPhysics === "dynamic" ? "Physics object" : "Build & arrange"}</span></div>
          <div className={styles.detailBody}>
            <div className={styles.eyebrow}>{item.category}</div><h3 className={styles.itemTitle}>{ASSETS[item.asset].name}</h3><p className={styles.tagline}>{item.tagline}</p>
            <button disabled={!ready || (!owned && wallet.coins < item.price)} className={styles.primary} onClick={() => { if (owned) placeAsset(item.asset); else buy(item.asset); }}>{owned ? "Place in my world" : `Unlock for ${item.price} coins`}</button>
            <p className={styles.purchaseNote}>{owned ? "Yours to reuse. Place as many as your map has room for." : wallet.coins < item.price ? "Try a discovery question below to earn coins." : "Unlock once. Place again for free. No real money."}</p>
            <p role="status" className={styles.notice}>{notice}</p>
            <section className={styles.tryIt}><h4>Try this in your world</h4><p>{item.tryIt}</p></section>
            {item.illustration && <p className={styles.limit}>{item.illustration}</p>}
            <DiscoveryQuestion key={item.asset} item={item} />
          </div>
        </aside>
      </div>
    </div>
  </dialog>;
}
