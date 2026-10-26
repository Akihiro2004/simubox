import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal-page";
import { SUPPORT_EMAIL } from "@/components/legal-links";

export const metadata: Metadata = { title: "Privacy · SimuBox" };

const mail = <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-[var(--dot-info)]">{SUPPORT_EMAIL}</a>;

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="26 October 2026">
      <p>
        SimuBox is run by Darrien Rafael Wijaya (Indonesia). We collect as little as we can, never sell your data and show no ads. Contact: {mail}.
      </p>
      <Section title="Questions you ask">
        <p>
          Your question and a short description of the current 3D scene are sent to an AI model (Google Gemini, and DeepSeek for some quick scene changes) to plan the lesson. SimuBox doesn&apos;t
          store your questions on its server and doesn&apos;t log their text.
        </p>
      </Section>
      <Section title="Lesson files">
        <p>A PDF or text file you add is sent to Google Gemini to suggest questions, then discarded. It is never saved.</p>
      </Section>
      <Section title="Read-aloud voices">
        <p>Lines Simu reads aloud are turned into speech by Google Gemini or Speechify, or by your browser&apos;s own voice. The audio isn&apos;t stored.</p>
      </Section>
      <Section title="Your account">
        <p>
          If you sign in with Google, we receive your name, email address and profile photo from Google, and store your saved experiments in your private space in Firebase (Google), where only
          you can read them. Delete any of them from the menu. Without an account, saved experiments stay in your browser.
        </p>
      </Section>
      <Section title="Credits and purchases">
        <p>
          We keep your credit balance, a short history of credits used and earned, and your recent orders (pack, price, status and date). Guests&apos; free credits are tracked by network (IP)
          address so they can&apos;t be claimed again and again. Payments are handled by Creem, our merchant of record, which receives your payment and billing details under{" "}
          <a href="https://www.creem.io/privacy" className="font-bold text-[var(--dot-info)]">its own privacy policy</a>. SimuBox never sees your card number.
        </p>
      </Section>
      <Section title="Security and logs">
        <p>
          Our server keeps short technical logs (for example whether a lesson succeeded and how long it took) to keep SimuBox working and to stop abuse. They don&apos;t contain your questions.
        </p>
      </Section>
      <Section title="Children">
        <p>
          SimuBox is built for students. We don&apos;t ask children for personal details beyond an optional Google sign-in, and purchases must be made by a parent, guardian or teacher.
        </p>
      </Section>
      <Section title="Your choices">
        <p>
          To see, correct or delete your account data, including your credit history, email {mail} from the address you sign in with. Payment records kept by Creem are deleted under its own
          rules. See also our <Link href="/terms" className="font-bold text-[var(--dot-info)]">terms of service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
