import Link from "next/link";

export const SUPPORT_EMAIL = "darrienwijaya@gmail.com";

/** Pricing, legal pages and the support address, shown on every public page (Creem's review checks for them). */
export function LegalLinks({ className = "" }: { className?: string }) {
  const link = "hover:text-ink";
  return (
    <nav aria-label="About SimuBox" className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12.5px] font-semibold text-ink-3 ${className}`}>
      <Link href="/wallet" className={link}>Pricing</Link>
      <span aria-hidden>·</span>
      <Link href="/terms" className={link}>Terms</Link>
      <span aria-hidden>·</span>
      <Link href="/privacy" className={link}>Privacy</Link>
      <span aria-hidden>·</span>
      <Link href="/credits" className={link}>About</Link>
      <span aria-hidden>·</span>
      <a href={`mailto:${SUPPORT_EMAIL}`} className={link}>Support: {SUPPORT_EMAIL}</a>
    </nav>
  );
}
