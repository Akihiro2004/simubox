import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About and credits · SimuBox" };

export default function Credits() {
  return (
    <main className="h-dvh overflow-y-auto px-5 py-12">
      <article className="mx-auto max-w-[620px] space-y-6 text-[16px] font-semibold leading-relaxed text-ink-2">
        <Link href="/" className="text-[15px] font-bold text-[var(--dot-info)]">
          Back to SimuBox
        </Link>
        <h1 className="text-[32px] font-extrabold leading-tight text-ink">About SimuBox</h1>
        <p>
          SimuBox turns a school science question into a small 3D world you can play with. Gemini plans the lesson: it picks a world, sets up the experiment and writes what Simu says. Everything it does goes through a fixed
          set of checked commands, and every number you see comes from the physics and chemistry code, not from the AI.
        </p>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">What is simulated, and what is a picture</h2>
          <p>Gravity, pushes and collisions use a real rigid-body physics engine. Throws use the exact equations of projectile motion with no air drag. Molecules use measured bond lengths and angles.</p>
          <p>Atoms are drawn with the simplified Bohr model, which is a teaching picture rather than what atoms really look like. Other topics are shown as labelled illustrations, and Simu says so.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-[19px] font-extrabold text-ink">Credits</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>3D models: every object, room and character was built for SimuBox from simple shapes in code. No third-party model files are used.</li>
            <li>Molecule geometry: NIST Computational Chemistry Comparison and Benchmark Database (CCCBDB), experimental values.</li>
            <li>Built with Next.js, React Three Fiber, drei and Rapier (MIT), three.js (MIT), Zod (MIT), Zustand (MIT), Lucide icons (ISC), the Google Gen AI SDK (Apache 2.0) and Firebase (Apache 2.0).</li>
            <li>Typeface: SF Pro Rounded on Apple devices, Nunito (SIL Open Font License) elsewhere.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
