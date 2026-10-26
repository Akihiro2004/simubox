"use client";

// The credits store (/wallet) and a simulated hosted checkout
// (/wallet/checkout). The checkout behaves like a payment gateway in test
// mode: test card numbers decide the outcome and no money ever moves.

import { ArrowLeft, Check, CreditCard, Loader2, Lock, QrCode, ShieldCheck, Smartphone, Tag } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { applyAccount, creditsApi, useBuilder, type AccountView } from "@/lib/builder/store";
import type { Order } from "@/lib/builder/economy";
import { discountedPrice, formatUsd, PACK_BY_ID, PACKS, PRICES, SIGNUP_BONUS, type Discount } from "@/lib/credits";
import { DISCOVERY_REWARD } from "@/lib/builder/catalog";
import { initFirebase, signIn, useAuth } from "@/lib/firebase";
import { LegalLinks, SUPPORT_EMAIL } from "./legal-links";

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

const card = "rounded-[20px] border border-[var(--hairline-strong)] bg-white/70 p-5 sm:p-6";
const eyebrow = "text-[12px] font-extrabold uppercase tracking-[0.08em] text-ink-3";

function Shell({ children, back = "/app", backLabel = "Back to SimuBox" }: { children: React.ReactNode; back?: string; backLabel?: string }) {
  return (
    <main className="h-dvh overflow-y-auto px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <div className="mx-auto max-w-[1040px] space-y-8">
        <Link href={back} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-2 hover:text-ink">
          <ArrowLeft size={16} /> {backLabel}
        </Link>
        {children}
      </div>
    </main>
  );
}

/** A Creem discount code: hidden behind a link until wanted, checked on the server, then applied to the packs it covers. */
function DiscountBox({ discount, onChange }: { discount: Discount | null; onChange: (d: Discount | null) => void }) {
  const [open, setOpen] = useState(false);
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
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[14px] font-semibold text-ink-2" aria-live="polite">
        <Tag size={15} className="text-[var(--dot-question)]" />
        <span className="font-mono font-bold text-ink">{discount.code}</span>
        <span>
          {off} {which}
        </span>
        <span aria-hidden>·</span>
        <button className="btn font-bold text-ink underline underline-offset-2" onClick={() => onChange(null)}>
          Remove
        </button>
      </p>
    );
  }
  if (!open) {
    return (
      <p className="text-center">
        <button className="btn text-[14px] font-bold text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setOpen(true)}>
          Have a discount code?
        </button>
      </p>
    );
  }
  return (
    <form
      className="mx-auto flex w-full max-w-[420px] flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code && !checking) void apply();
      }}
    >
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Discount code</span>
          <input
            autoFocus
            className="h-11 w-full rounded-full border border-[var(--hairline-strong)] bg-white px-4 font-mono text-[15px] font-bold uppercase outline-none placeholder:font-sans placeholder:normal-case placeholder:font-semibold placeholder:text-ink-3 focus:border-ink"
            placeholder="Discount code"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 14))}
          />
        </label>
        <button type="submit" disabled={!code || checking} className="btn btn-ink flex h-11 min-w-[88px] items-center justify-center rounded-full px-5 text-[15px] font-bold">
          {checking ? <Loader2 size={16} className="animate-spin" /> : "Apply"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-center text-[13px] font-bold text-[var(--dot-warning)]">
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
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-[var(--hairline-strong)] bg-white/60 px-5 py-4">
      <div>
        <h2 className="text-[16px] font-extrabold">Sign in to buy credits</h2>
        <p className="text-[14px] font-semibold text-ink-2">Credits follow your account to any device. New accounts get {SIGNUP_BONUS} free credits.</p>
        {error && <p className="mt-1 text-[13px] font-bold text-[var(--dot-warning)]">{error}</p>}
      </div>
      <button disabled={!available} className="btn btn-ink h-10 rounded-full px-5 text-[14px] font-bold" onClick={() => void signIn()}>
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

const sectionTitle = "mb-1 text-[15px] font-extrabold";
const row = "flex items-baseline justify-between gap-4 border-b border-[var(--hairline)] py-3 text-[14px] font-semibold last:border-0";

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
      <header className="space-y-3 pt-2 text-center sm:pt-6">
        <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[44px]">Credits</h1>
        <p className="mx-auto max-w-[480px] text-[16px] font-semibold text-ink-2">Each question to Simu uses credits. A lesson that fails to load is refunded automatically.</p>
        <p className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline-strong)] bg-white/60 px-4 py-1.5 text-[14px] font-semibold text-ink-2" aria-live="polite">
          Your balance
          <span className="font-extrabold text-ink" data-testid="balance">
            {loading ? "…" : (account?.credits ?? 0).toLocaleString()}
          </span>
          credits
        </p>
      </header>

      {!loading && loadError && (
        <p role="alert" className="text-center text-[14px] font-bold text-[var(--dot-warning)]">
          {loadError}
        </p>
      )}
      {!loading && !signedIn && <SignInCard />}

      <section aria-label="Credit packs" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PACKS.map((p) => {
          const popular = p.id === "explorer";
          const price = priceOf(p);
          return (
            <article
              key={p.id}
              className={`flex flex-col rounded-[20px] border bg-white/70 p-5 ${popular ? "border-ink" : "border-[var(--hairline-strong)]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-extrabold">{p.name}</h2>
                {popular && <span className="rounded-full bg-[var(--fill)] px-2.5 py-0.5 text-[12px] font-bold text-ink-2">Popular</span>}
              </div>
              <p className="mt-4 flex items-baseline gap-2">
                <span className="text-[36px] font-extrabold leading-none tracking-[-0.02em]">{formatUsd(price)}</span>
                {price < p.price && <s className="text-[15px] font-semibold text-ink-3">{formatUsd(p.price)}</s>}
              </p>
              <p className="mt-1 text-[13px] font-semibold text-ink-3">One-time payment</p>
              <ul className="mt-5 space-y-1.5 text-[14px] font-semibold text-ink-2">
                <li>
                  <span className="font-extrabold text-ink">{p.credits.toLocaleString()}</span> credits
                </li>
                <li>{p.note}</li>
                <li>{formatUsd(Math.round((price / p.credits) * PRICES.lesson))} per lesson</li>
              </ul>
              <button
                disabled={!signedIn || busy !== null}
                className={`btn mt-6 flex h-11 items-center justify-center rounded-full text-[15px] font-bold ${
                  popular ? "btn-ink" : "border border-[var(--hairline-strong)] bg-white text-ink hover:border-ink"
                }`}
                onClick={() => void buy(p.id)}
                aria-label={`Buy ${p.name}: ${p.credits} credits for ${formatUsd(price)}`}
              >
                {busy === p.id ? <Loader2 size={17} className="animate-spin" /> : "Buy"}
              </button>
            </article>
          );
        })}
      </section>
      {error && (
        <p role="alert" className="text-center text-[14px] font-bold text-[var(--dot-warning)]">
          {error}
        </p>
      )}
      {account?.payments === "creem" && <DiscountBox discount={discount} onChange={setDiscount} />}

      <div className="grid gap-x-12 gap-y-10 pt-6 lg:grid-cols-2">
        <section>
          <h2 className={sectionTitle}>What credits buy</h2>
          <ul>
            {SPEND.map((s) => (
              <li key={s.what} className={row}>
                <span className="text-ink-2">{s.what}</span>
                <span className="shrink-0 font-bold text-ink">{s.cost}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] font-semibold text-ink-3">
            Free credits: {SIGNUP_BONUS} when you first sign in, and {DISCOVERY_REWARD} for each discovery question you answer right in Build & Discover.
          </p>
        </section>
        <section>
          <h2 className={sectionTitle}>Recent activity</h2>
          {!account?.history.length ? (
            <p className="py-3 text-[14px] font-semibold text-ink-3">Nothing yet.</p>
          ) : (
            <ul className="max-h-[340px] overflow-y-auto pr-1">
              {account.history.map((h, i) => (
                <li key={`${h.at}-${i}`} className={row}>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{h.reason}</span>
                    <span className="text-[13px] text-ink-3">{new Date(h.at).toLocaleString()}</span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${h.amount > 0 ? "text-[var(--dot-question)]" : "text-ink-2"}`}>
                    {h.amount > 0 ? "+" : ""}
                    {h.amount.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="space-y-3 border-t border-[var(--hairline)] pt-6 text-center text-[13px] font-semibold text-ink-3">
        <p className="flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} />
          {account?.payments === "creem" ? "Secure payment by Creem, our merchant of record. Card details never reach SimuBox." : "Payments run in sandbox mode for this demo: no real money is charged."}
        </p>
        <p>
          Prices in US dollars, no subscription. By buying you agree to the{" "}
          <Link href="/terms" className="font-bold underline underline-offset-2">
            Terms
          </Link>
          ; unused packs can be refunded within 14 days.
        </p>
        <LegalLinks />
      </footer>
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
        <Status icon={<Loader2 size={22} className="animate-spin" />} title="Loading your order…" />
      </Shell>
    );
  }
  if (!order || !pack) {
    return (
      <Shell back="/wallet" backLabel="Back to credits">
        {!account?.signedIn && <SignInCard />}
        <Status title="Order not found" text="This checkout link has expired or belongs to another account. Pick a pack again.">
          <Link href="/wallet" className="btn btn-ink inline-flex h-11 items-center rounded-full px-6 text-[15px] font-bold">
            See credit packs
          </Link>
        </Status>
      </Shell>
    );
  }

  const digits = number.replace(/\D/g, "");
  const ready = method === "card" ? digits.length >= 15 && /^\d{2}\s*\/\s*\d{2}$/.test(expiry) && /^\d{3,4}$/.test(cvc) && name.trim().length > 1 : method === "ewallet" ? phone.replace(/\D/g, "").length >= 9 : true;

  if (done) {
    return (
      <Shell back="/wallet" backLabel="Back to credits">
        <Receipt order={done} packName={pack.name} balance={account?.credits} />
      </Shell>
    );
  }

  return (
    <Shell back="/wallet" backLabel="Back to credits">
      <p className="mx-auto w-fit rounded-full border border-[var(--hairline-strong)] bg-white/60 px-4 py-1.5 text-[13px] font-bold text-ink-2" role="note">
        Test mode · No real money moves
      </p>

      {(
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
      <Status
        icon={<Loader2 size={22} className="animate-spin" />}
        title="Confirming your payment…"
        text={waited ? "This is taking longer than usual. If you paid, your credits will appear here automatically; you can close this page." : "This takes a few seconds after you pay on Creem."}
      />
    </Shell>
  );
}

/** A centred one-message screen: loading, waiting or not found. */
function Status({ icon, title, text, children }: { icon?: React.ReactNode; title: string; text?: string; children?: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-[440px] space-y-3 pt-10 text-center" aria-live="polite">
      {icon && <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-[var(--hairline-strong)] text-ink-2">{icon}</span>}
      <h1 className="text-[24px] font-extrabold tracking-[-0.01em]">{title}</h1>
      {text && <p className="text-[15px] font-semibold text-ink-2">{text}</p>}
      {children && <div className="pt-3">{children}</div>}
    </section>
  );
}

const METHOD: Record<string, string> = { creem: "Creem", qris: "QR payment (test)", ewallet: "E-wallet (test)" };

/** What a paid order bought, as a plain receipt. */
function Receipt({ order, packName, balance }: { order: Order; packName: string; balance?: number }) {
  const rows: [string, string][] = [
    ["Pack", `${packName} · ${order.credits.toLocaleString()} credits`],
    ...(order.discount ? ([["Discount code", order.discount]] as [string, string][]) : []),
    ["Paid", formatUsd(order.price)],
    ["Payment method", order.method === "card" ? `Card ending ${order.last4} (test)` : (METHOD[order.method ?? ""] ?? "Card")],
    ["Date", new Date(order.paidAt ?? order.createdAt).toLocaleString()],
    ["Receipt", order.id],
  ];
  return (
    <section className="mx-auto max-w-[440px] pt-6 text-center" aria-live="polite">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--dot-question)] text-white">
        <Check size={24} strokeWidth={3} />
      </span>
      <h1 className="mt-5 text-[30px] font-extrabold leading-tight tracking-[-0.02em]">Payment successful</h1>
      <p className="mt-1 text-[16px] font-semibold text-ink-2">
        <span className="font-extrabold text-ink">+{order.credits.toLocaleString()}</span> credits added to your account
      </p>
      {balance != null && (
        <p className="mx-auto mt-4 w-fit rounded-full border border-[var(--hairline-strong)] bg-white/60 px-4 py-1.5 text-[14px] font-semibold text-ink-2">
          New balance <span className="font-extrabold text-ink">{balance.toLocaleString()}</span> credits
        </p>
      )}
      <dl className="mt-8 border-t border-[var(--hairline)] text-left text-[14px] font-semibold">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-6 border-b border-[var(--hairline)] py-3">
            <dt className="shrink-0 text-ink-3">{k}</dt>
            <dd className="truncate text-right text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <Link href="/app" className="btn btn-ink inline-flex h-11 items-center rounded-full px-6 text-[15px] font-bold">
          Back to exploring
        </Link>
        <Link href="/wallet" className="btn inline-flex h-11 items-center rounded-full border border-[var(--hairline-strong)] bg-white px-6 text-[15px] font-bold text-ink hover:border-ink">
          View credits
        </Link>
      </div>
      <p className="mt-6 text-[13px] font-semibold text-ink-3">
        {order.method === "creem" ? "Creem has emailed you a receipt. " : ""}Questions?{" "}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold underline underline-offset-2">
          {SUPPORT_EMAIL}
        </a>
      </p>
    </section>
  );
}
