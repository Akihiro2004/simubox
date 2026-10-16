import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · SimuBox" };

export default function Privacy() {
  return (
    <main className="h-dvh overflow-y-auto px-5 py-12">
      <article className="mx-auto max-w-[620px] space-y-6 text-[16px] font-semibold leading-relaxed text-ink-2">
        <Link href="/" className="text-[15px] font-bold text-[var(--dot-info)]">
          Back to SimuBox
        </Link>
        <h1 className="text-[32px] font-extrabold leading-tight text-ink">Privacy</h1>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">Questions you ask</h2>
          <p>Your question and a short description of the current 3D scene are sent to Google&apos;s Gemini model to plan the lesson. SimuBox doesn&apos;t store your questions on its server and doesn&apos;t log their text.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">Lesson files</h2>
          <p>A PDF or text file you add is read in memory to suggest questions, then discarded. It is never saved.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">Saved experiments</h2>
          <p>Without an account, saved experiments stay in this browser. If you sign in with Google, they are stored in your private space in Firebase, where only you can read them. Delete any of them from the menu.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">Voice</h2>
          <p>Read-aloud uses your browser&apos;s built-in voice, so the text stays on your device.</p>
        </section>
      </article>
    </main>
  );
}
