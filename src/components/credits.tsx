"use client";

// The credits store (/wallet) and a simulated hosted checkout
// (/wallet/checkout). The checkout behaves like a payment gateway in test
// mode: test card numbers decide the outcome and no money ever moves.

import { ArrowLeft, Check, Coins, CreditCard, Loader2, Lock, QrCode, ShieldCheck, Smartphone, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { applyAccount, creditsApi, useBuilder, type AccountView } from "@/lib/builder/store";
import type { Order } from "@/lib/builder/economy";
import { discountedPrice, formatUsd, PACK_BY_ID, PACKS, PRICES, SIGNUP_BONUS, type Discount } from "@/lib/credits";
import { DISCOVERY_REWARD } from "@/lib/builder/catalog";
import { initFirebase, signIn, useAuth } from "@/lib/firebase";
import { LegalLinks } from "./legal-links";

/** The account once sign-in has settled, refetched when the student signs in or out. */
function useAccount(): { account: AccountView | null; loading: boolean; loadError: string | null } {
  const ready = useAuth((a) => a.ready);
  const uid = useAuth((a) => a.user?.uid);
  const account = useBuilder((s) => s.account);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => void initFirebase(), []);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    void creditsApi()
      .then((r) => {
        if (!alive) return;
        applyAccount(r.account);
        setLoadError(r.error ?? null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [ready, uid]);
  return { account, loading: loading || !ready, loadError };
}

const card = "glass rounded-[24px] p-5 sm:p-6";
const eyebrow = "text-[12px] font-extrabold uppercase tracking-[0.08em] text-ink-3";

function Shell({ children, back = "/app", backLabel = "Back to SimuBox" }: { children: React.ReactNode; back?: string; backLabel?: string }) {
  return (
    <main className="h-dvh overflow-y-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-[1040px] space-y-6">
        <Link href={back} className="inline-flex items-center gap-1.5 text-[15px] font-bold text-[var(--dot-info)]">
          <ArrowLeft size={16} /> {backLabel}
        </Link>
        {children}
      </div>
    </main>
  );
}

/** A Creem discount code: checked on the server, then shown on the packs it takes money off. */
function DiscountBox({ discount, onChange }: { discount: Discount | null; onChange: (d: Discount | null) => void }) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    setChecking(true);
    setError(null);
    const r = await creditsApi({ action: "discount", code });
    setChecking(false);
    if (r.discount) onChange(r.discount);
    else setError(r.code === "sign_in" ? "Sign in first to use a discount code." : r.error ?? "That discount code isn't valid.");
  };
  if (discount) {
    const off = discount.type === "percentage" ? `${discount.percentage}% off` : `${formatUsd(discount.amount ?? 0)} off`;
    const which = discount.packs.length === PACKS.length ? "every pack" : discount.packs.map((p) => PACK_BY_ID[p]?.name ?? p).join(", ");
    return (
      <section className={`${card} flex flex-wrap items-center justify-between gap-3 !py-4`} aria-live="polite">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <Tag size={17} className="text-[var(--dot-question)]" />
          <span>
            <span className="font-extrabold">{discount.code}</span> applied: {off} {which}
          </span>
        </p>
        <button className="btn text-[14px] font-bold text-ink-2 underline" onClick={() => onChange(null)}>
          Remove
        </button>
      </section>
    );
  }
  return (
    <form
      className={`${card} flex flex-wrap items-center gap-3 !py-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (code && !checking) void apply();
      }}
    >
      <label className="flex min-w-[220px] flex-1 items-center gap-2">
        <Tag size={17} className="shrink-0 text-ink-3" />
        <span className="sr-only">Discount code</span>
        <input
          className="h-11 w-full rounded-[14px] border border-[var(--hairline)] bg-white/80 px-4 font-mono text-[16px] font-bold uppercase outline-none focus:border-[var(--dot-info)]"
          placeholder="Discount code"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 14))}
        />
      </label>
      <button type="submit" disabled={!code || checking} className="btn btn-ink flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-extrabold">
        {checking ? <Loader2 size={16} className="animate-spin" /> : "Apply"}
      </button>
      {error && (
        <p role="alert" className="w-full text-[14px] font-bold text-[var(--dot-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}

function SignInCard() {
  const available = useAuth((a) => a.available);
  const error = useAuth((a) => a.error);
  return (
    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div>
        <h2 className="text-[19px] font-extrabold">Sign in to buy credits</h2>
        <p className="text-[15px] font-semibold text-ink-2">Credits belong to your account, so they follow you to any device. New accounts get {SIGNUP_BONUS} free credits.</p>
        {error && <p className="mt-1 text-[14px] font-bold text-[var(--dot-warning)]">{error}</p>}
      </div>
      <button disabled={!available} className="btn btn-ink h-11 rounded-full px-5 text-[15px] font-extrabold" onClick={() => void signIn()}>
        Sign in with Google
      </button>
    </section>
  );
}

const SPEND = [
  { what: "A new question (full lesson)", cost: `${PRICES.lesson} credits` },
  { what: "Changing the current scene", cost: `${PRICES.quick} credits` },
  { what: "Off-topic or unclear questions", cost: `${PRICES.quick} credits` },
  { what: "Reading a lesson file", cost: `${PRICES.upload} credits` },
  { what: "Build & Discover items", cost: "3–10 credits, once" },
  { what: "Simu's voice, sliders, dragging", cost: "Free" },
];

export function CreditsStore() {
  const router = useRouter();
  const { account, loading, loadError } = useAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const user = useAuth((a) => a.user);
  const signedIn = Boolean(user) || (account?.signedIn ?? false);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const priceOf = (p: (typeof PACKS)[number]) => (discount?.packs.includes(p.id) ? discountedPrice(p.price, discount) : p.price);

  const buy = async (pack: string) => {
    setBusy(pack);
    setError(null);
    const r = await creditsApi({ action: "order", pack, ...(discount?.packs.includes(pack) ? { discount: discount.code } : {}) });
    if (r.checkoutUrl) window.location.assign(r.checkoutUrl);
    else if (r.order) router.push(`/wallet/checkout?order=${r.order.id}`);
    else {
      setError(r.code === "sign_in" ? "Sign in first to buy credits." : r.error ?? "Couldn't start the checkout.");
      setBusy(null);
    }
  };

  return (
    <Shell>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className={eyebrow}>Credits</p>
          <h1 className="text-[32px] font-extrabold leading-tight sm:text-[40px]">Keep the questions coming</h1>
          <p className="max-w-[560px] text-[16px] font-semibold text-ink-2">Each question to Simu uses credits. A lesson that fails to load is refunded automatically.</p>
        </div>
        <div className={`${card} flex items-center gap-3 !py-4`} aria-live="polite">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--accent)]">
            <Coins size={22} />
          </span>
          <div>
            <p className={eyebrow}>Your balance</p>
            <p className="text-[28px] font-extrabold leading-none" data-testid="balance">
              {loading ? "…" : (account?.credits ?? 0)}
            </p>
          </div>
        </div>
      </header>

      {!loading && loadError && (
        <p role="alert" className="text-[15px] font-bold text-[var(--dot-warning)]">
          {loadError}
        </p>
      )}
      {!loading && !signedIn && <SignInCard />}
      {account?.payments === "creem" && <DiscountBox discount={discount} onChange={setDiscount} />}

      <section aria-label="Credit packs" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PACKS.map((p) => {
          const popular = p.id === "explorer";
          const price = priceOf(p);
          return (
            <article key={p.id} className={`${card} relative flex flex-col gap-3 ${popular ? "ring-2 ring-[var(--accent)]" : ""}`}>
              {popular && <span className="absolute -top-3 left-5 rounded-full bg-[var(--accent)] px-3 py-0.5 text-[12px] font-extrabold">Most popular</span>}
              <p className={eyebrow}>{p.name}</p>
              <p className="flex items-baseline gap-1.5">
                <span className="text-[34px] font-extrabold leading-none">{p.credits.toLocaleString()}</span>
                <span className="text-[15px] font-bold text-ink-2">credits</span>
              </p>
              <p className="text-[14px] font-semibold text-ink-2">{p.note}</p>
              <p className="text-[14px] font-semibold text-ink-3">{formatUsd(Math.round((price / p.credits) * PRICES.lesson))} per lesson</p>
              <button
                disabled={!signedIn || busy !== null}
                className={`btn ${popular ? "btn-accent" : "btn-ink"} mt-auto flex h-11 items-center justify-center gap-2 rounded-full text-[16px] font-extrabold`}
                onClick={() => void buy(p.id)}
                aria-label={`Buy ${p.name}: ${p.credits} credits for ${formatUsd(price)}`}
              >
                {busy === p.id ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : price < p.price ? (
                  <>
                    <s className="text-[14px] font-bold opacity-60">{formatUsd(p.price)}</s> {formatUsd(price)}
                  </>
                ) : (
                  formatUsd(p.price)
                )}
              </button>
            </article>
          );
        })}
      </section>
      {error && (
        <p role="alert" className="text-[15px] font-bold text-[var(--dot-warning)]">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-[19px] font-extrabold">What credits buy</h2>
          <ul className="divide-y divide-[var(--hairline)]">
            {SPEND.map((s) => (
              <li key={s.what} className="flex justify-between gap-4 py-2.5 text-[15px] font-semibold">
                <span className="text-ink-2">{s.what}</span>
                <span className="shrink-0 font-extrabold">{s.cost}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[14px] font-semibold text-ink-3">
            Free credits: {SIGNUP_BONUS} when you first sign in, and {DISCOVERY_REWARD} for each discovery question you answer right in Build & Discover.
          </p>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-[19px] font-extrabold">Recent activity</h2>
          {!account?.history.length ? (
            <p className="text-[15px] font-semibold text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="max-h-[320px] divide-y divide-[var(--hairline)] overflow-y-auto pr-1">
              {account.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex justify-between gap-4 py-2 text-[14px] font-semibold">
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{h.reason}</span>
                    <span className="text-ink-3">{new Date(h.at).toLocaleString()}</span>
                  </span>
                  <span className={`shrink-0 font-extrabold ${h.amount > 0 ? "text-[var(--dot-question)]" : "text-ink-2"}`}>
                    {h.amount > 0 ? "+" : ""}
                    {h.amount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-3">
        <ShieldCheck size={15} />
        {account?.payments === "creem" ? "Secure payment by Creem, our merchant of record. Card details never reach SimuBox." : "Payments run in sandbox mode for this demo: no real money is charged."}
      </p>
      <p className="text-[13px] font-semibold text-ink-3">
        One-time payments in US dollars, no subscription. By buying you agree to the <Link href="/terms" className="font-bold underline">Terms</Link>; unused packs can be refunded within 14 days.
      </p>
      <LegalLinks className="!justify-start" />
    </Shell>
  );
}

/** A decorative QR-style code drawn from the order id (it encodes nothing). */
function FakeQr({ seed }: { seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const bit = (x: number, y: number) => {
    let v = h ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    return (v ^ (v >>> 16)) & 1;
  };
  const finder = (x: number, y: number) => [[0, 0], [n - 7, 0], [0, n - 7]].some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && bit(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="h-48 w-48 rounded-xl bg-white" role="img" aria-label="Payment QR code (sandbox)">
      <g fill="#1c1e22">
        {cells}
        {[[0, 0], [n - 7, 0], [0, n - 7]].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width={7} height={7} />
            <rect x={x + 1} y={y + 1} width={5} height={5} fill="#fff" />
            <rect x={x + 2} y={y + 2} width={3} height={3} />
          </g>
        ))}
      </g>
    </svg>
  );
}

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", result: "Succeeds" },
  { number: "4000 0000 0000 0002", result: "Declined" },
  { number: "4000 0000 0000 9995", result: "Insufficient funds" },
];

const field = "h-12 w-full rounded-[14px] border border-[var(--hairline)] bg-white/80 px-4 text-[16px] font-bold outline-none focus:border-[var(--dot-info)]";

export function CheckoutFromUrl() {
  return <Checkout orderId={useSearchParams().get("order") ?? ""} />;
}

function Checkout({ orderId }: { orderId: string }) {
  const { account, loading } = useAccount();
  const order = account?.orders.find((o) => o.id === orderId) ?? null;
  const pack = order ? PACK_BY_ID[order.pack] : null;
  const [method, setMethod] = useState<"card" | "qris" | "ewallet">("card");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Order | null>(null);
  const done = receipt ?? (order?.status === "paid" ? order : null);

  const pay = async () => {
    setPaying(true);
    setError(null);
    // A real gateway takes a moment to authorise; so does this one.
    await new Promise((r) => setTimeout(r, 1200));
    const r = await creditsApi({ action: "pay", order: orderId, method, card: method === "card" ? { number, expiry, cvc } : undefined });
    applyAccount(r.account);
    setPaying(false);
    if (r.order?.status === "paid") setReceipt(r.order);
    else setError(r.error ?? "The payment didn't go through.");
  };

  if (!loading && order?.checkout && !done) return <Confirming orderId={orderId} />;

  if (loading) {
    return (
      <Shell back="/wallet" backLabel="Back to credits">
        <p className="flex items-center gap-2 text-[16px] font-bold text-ink-2" role="status">
          <Loader2 size={18} className="animate-spin" /> Loading your order…
        </p>
      </Shell>
    );
  }
  if (!order || !pack) {
    return (
      <Shell back="/wallet" backLabel="Back to credits">
        {!account?.signedIn && <SignInCard />}
        <section className={card}>
          <h1 className="text-[24px] font-extrabold">Order not found</h1>
          <p className="text-[15px] font-semibold text-ink-2">This checkout link has expired or belongs to another account. Pick a pack again.</p>
        </section>
      </Shell>
    );
  }

  const digits = number.replace(/\D/g, "");
  const ready = method === "card" ? digits.length >= 15 && /^\d{2}\s*\/\s*\d{2}$/.test(expiry) && /^\d{3,4}$/.test(cvc) && name.trim().length > 1 : method === "ewallet" ? phone.replace(/\D/g, "").length >= 9 : true;

  return (
    <Shell back="/wallet" backLabel="Back to credits">
      <div className="flex items-center justify-between gap-3 rounded-[16px] bg-[var(--accent)] px-4 py-2.5 text-[14px] font-extrabold" role="note">
        <span>Test mode · No real money moves</span>
        <span className="hidden sm:inline">Sandbox Pay</span>
      </div>

      {done ? (
        <section className={`${card} mx-auto max-w-[520px] text-center`} aria-live="polite">
          <span className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-[var(--dot-question)] text-white">
            <Check size={34} strokeWidth={3} />
          </span>
          <h1 className="text-[28px] font-extrabold">Payment successful</h1>
          <p className="text-[17px] font-bold text-ink-2">+{done.credits.toLocaleString()} credits added</p>
          <dl className="mx-auto mt-5 max-w-[340px] space-y-1.5 text-left text-[14px] font-semibold">
            {[
              ["Receipt", done.id],
              ["Pack", pack.name],
              ...(done.discount ? [["Discount code", done.discount]] : []),
              ["Paid", formatUsd(done.price)],
              ["Method", done.method === "creem" ? "Paid via Creem" : done.method === "card" ? `Card ending ${done.last4}` : done.method === "qris" ? "QR payment" : "E-wallet"],
              ["New balance", `${account?.credits ?? "…"} credits`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-ink-3">{k}</dt>
                <dd className="truncate font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
          <Link href="/app" className="btn btn-accent mt-6 inline-flex h-12 items-center rounded-full px-6 text-[16px] font-extrabold">
            Back to exploring
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <section className={card} aria-label="Order summary">
            <p className={eyebrow}>Pay SimuBox</p>
            <p className="mt-1 text-[36px] font-extrabold leading-none">{formatUsd(order.price)}</p>
            <ul className="mt-5 space-y-2 text-[15px] font-semibold">
              <li className="flex justify-between gap-4">
                <span>
                  {pack.name} pack · {pack.credits.toLocaleString()} credits
                </span>
                <span className="font-extrabold">{formatUsd(order.price)}</span>
              </li>
              <li className="flex justify-between gap-4 text-ink-3">
                <span>Tax</span>
                <span>$0.00</span>
              </li>
              <li className="flex justify-between gap-4 border-t border-[var(--hairline)] pt-2 font-extrabold">
                <span>Total due</span>
                <span>{formatUsd(order.price)}</span>
              </li>
            </ul>
            <p className="mt-5 text-[13px] font-semibold text-ink-3">Order {order.id}</p>
            <div className="mt-5 rounded-[16px] bg-[var(--fill)] p-4">
              <p className="mb-2 text-[13px] font-extrabold">Test cards (any future expiry, any CVC)</p>
              <ul className="space-y-1.5">
                {TEST_CARDS.map((t) => (
                  <li key={t.number} className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                    <button
                      className="btn rounded-lg bg-white/80 px-2 py-1 font-mono text-[13px] font-bold"
                      onClick={() => {
                        setMethod("card");
                        setNumber(t.number);
                      }}
                    >
                      {t.number}
                    </button>
                    <span className="text-ink-2">{t.result}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className={card} aria-label="Payment">
            <div role="tablist" aria-label="Payment method" className="mb-5 grid grid-cols-3 gap-2 rounded-[16px] bg-[var(--fill)] p-1">
              {(
                [
                  ["card", "Card", CreditCard],
                  ["qris", "QR code", QrCode],
                  ["ewallet", "E-wallet", Smartphone],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={method === id}
                  className={`btn flex h-10 items-center justify-center gap-1.5 rounded-[12px] text-[14px] font-extrabold ${method === id ? "bg-white shadow-sm" : "text-ink-2"}`}
                  onClick={() => {
                    setMethod(id);
                    setError(null);
                  }}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>

            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (ready && !paying) void pay();
              }}
            >
              {method === "card" && (
                <>
                  <label className="block space-y-1">
                    <span className="text-[13px] font-extrabold text-ink-2">Card number</span>
                    <input className={`${field} font-mono`} inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 "))} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-[13px] font-extrabold text-ink-2">Expiry</span>
                      <input
                        className={field}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="MM / YY"
                        value={expiry}
                        onChange={(e) => {
                          const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                          setExpiry(d.length > 2 ? `${d.slice(0, 2)} / ${d.slice(2)}` : d);
                        }}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[13px] font-extrabold text-ink-2">CVC</span>
                      <input className={field} inputMode="numeric" autoComplete="off" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))} />
                    </label>
                  </div>
                  <label className="block space-y-1">
                    <span className="text-[13px] font-extrabold text-ink-2">Name on card</span>
                    <input className={field} autoComplete="off" placeholder="Alex Explorer" value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} />
                  </label>
                </>
              )}
              {method === "qris" && (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <FakeQr seed={order.id} />
                  <p className="text-[14px] font-semibold text-ink-2">Scan with any banking or e-wallet app. In sandbox mode, press the button to simulate a successful scan.</p>
                </div>
              )}
              {method === "ewallet" && (
                <label className="block space-y-1">
                  <span className="text-[13px] font-extrabold text-ink-2">Phone number linked to your e-wallet</span>
                  <input className={field} inputMode="tel" autoComplete="off" placeholder="0812 3456 7890" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d +]/g, "").slice(0, 16))} />
                  <span className="block text-[13px] font-semibold text-ink-3">In sandbox mode the approval is simulated; nothing is sent to your phone.</span>
                </label>
              )}

              {error && (
                <p role="alert" className="rounded-[12px] bg-[rgba(229,72,77,0.1)] px-3 py-2 text-[14px] font-bold text-[var(--dot-warning)]">
                  {error}
                </p>
              )}
              <button type="submit" disabled={!ready || paying} className="btn btn-ink flex h-12 w-full items-center justify-center gap-2 rounded-full text-[16px] font-extrabold">
                {paying ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Processing…
                  </>
                ) : (
                  <>
                    <Lock size={16} /> {method === "qris" ? "Simulate scan and pay" : `Pay ${formatUsd(order.price)}`}
                  </>
                )}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-3">
                <ShieldCheck size={14} /> Sandbox checkout. Card details are checked once and never stored.
              </p>
            </form>
          </section>
        </div>
      )}
    </Shell>
  );
}

/** Back from Creem's checkout: asks the server to confirm the payment until it lands (the webhook may beat it). */
function Confirming({ orderId }: { orderId: string }) {
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    const tick = async () => {
      const r = await creditsApi({ action: "confirm", order: orderId });
      if (!alive) return;
      applyAccount(r.account);
      if (r.order?.status === "paid") return;
      if (++tries === 10) setWaited(true);
      if (tries < 60) setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [orderId]);
  return (
    <Shell back="/wallet" backLabel="Back to credits">
      <section className={`${card} mx-auto max-w-[520px] text-center`} aria-live="polite">
        <Loader2 size={34} className="mx-auto mb-3 animate-spin" />
        <h1 className="text-[24px] font-extrabold">Confirming your payment…</h1>
        <p className="text-[15px] font-semibold text-ink-2">
          {waited ? "This is taking longer than usual. If you paid, your credits will appear here automatically; you can close this page." : "This takes a few seconds after you pay on Creem."}
        </p>
      </section>
    </Shell>
  );
}
