import { describe, expect, it, beforeEach, vi } from "vitest";

// The landing page navigates into the studio with the app router; a static render has none.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, prefetch: () => {} }) }));
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LandingPage, { applyHookToStudio } from "@/components/LandingPage";
import { openWorld, resetToNewExperiment, WORLD_ITEMS } from "@/components/ui/chrome";
import { STARTERS } from "@/components/ui/composer";
import { useAuth } from "@/lib/firebase";
import { useSim } from "@/lib/store";

describe("LandingPage & studio handoff", () => {
  beforeEach(() => {
    resetToNewExperiment();
    const guest = { user: null, available: true, ready: true, error: null };
    useAuth.setState(guest);
    Object.assign(useAuth.getInitialState(), guest);
  });

  it("renders single-screen interactive hook, starter prompts, and all 10 world pills when logged out", () => {
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain("Ask anything. Watch it come to life.");
    expect(html).toContain("Sign in with Google");
    for (const w of WORLD_ITEMS) {
      expect(html).toContain(w.name);
    }
    expect(html).toContain(STARTERS[0]);
  });

  it("renders personalized welcome, account info, and saved experiments access when logged in", () => {
    const authed = {
      user: { uid: "u123", name: "Alex Rivera", email: "alex@school.edu", photo: null },
      available: true,
      ready: true,
      error: null,
    };
    useAuth.setState(authed);
    Object.assign(useAuth.getInitialState(), authed);
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain("Welcome back, Alex");
    expect(html).toContain("alex@school.edu");
    expect(html).toContain("Sign out");
  });

  it("applyHookToStudio transfers live interactive hook settings directly into the 3D studio state", () => {
    applyHookToStudio({ mode: "projectile", angleDeg: 60, speed: 12 });
    expect(useSim.getState().world).toBe("court");
    expect(useSim.getState().projectile).toMatchObject({ angleDeg: 60, speed: 12, status: "flying" });

    applyHookToStudio({ mode: "gravity", g: 0 });
    expect(useSim.getState().world).toBe("bedroom");
    expect(useSim.getState().gravity).toEqual([0, 0, 0]);

    applyHookToStudio({ mode: "molecule", formula: "CO2" });
    expect(useSim.getState().world).toBe("lab");
    expect(useSim.getState().objects.hook_mol).toMatchObject({ type: "molecule", molecule: "CO2" });
  });

  it("openWorld switches the active world and seeds water in the science lab", () => {
    openWorld("lab");
    const s = useSim.getState();
    expect(s.world).toBe("lab");
    expect(s.objects.water).toMatchObject({ type: "molecule", molecule: "H2O" });

    resetToNewExperiment();
    expect(useSim.getState().world).toBe("bedroom");
    expect(useSim.getState().messages).toEqual([]);
  });
});
