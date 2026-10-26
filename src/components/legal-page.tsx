import Link from "next/link";
import { LegalLinks } from "./legal-links";

/** Shared layout for the Terms and Privacy pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="h-dvh overflow-y-auto px-5 py-12">
      <article className="mx-auto max-w-[680px] space-y-6 text-[16px] font-semibold leading-relaxed text-ink-2">
        <Link href="/" className="text-[15px] font-bold text-[var(--dot-info)]">
          Back to SimuBox
        </Link>
        <header>
          <h1 className="text-[32px] font-extrabold leading-tight text-ink">{title}</h1>
          <p className="text-[14px] text-ink-3">Last updated {updated}</p>
        </header>
        {children}
        <LegalLinks className="border-t border-[var(--hairline)] pt-6" />
      </article>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[19px] font-extrabold text-ink">{title}</h2>
      {children}
    </section>
  );
}
