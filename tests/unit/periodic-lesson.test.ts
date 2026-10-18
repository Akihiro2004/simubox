import { describe, expect, it } from "vitest";
import { PERIODIC_ELEMENTS } from "@/lib/periodic-table";
import { periodicLesson } from "@/lib/periodic-lesson";
import { ScenePlan } from "@/lib/ssp/schema";

describe("built-in periodic table teaching", () => {
  it("offers a valid table-only tour for all 118 elements", () => {
    for (const e of PERIODIC_ELEMENTS) {
      const plan = ScenePlan.parse(periodicLesson(e.number));
      expect(plan.reply).toContain(`${e.number} protons`);
      expect(plan.reply).toContain(e.name);
      const commands = plan.steps.flatMap(step => step.commands);
      expect(commands.some(c => c.op === "build_atom" || c.op === "load_world")).toBe(false);
      expect(commands.filter(c => c.op === "show_periodic_table")).toHaveLength(3);
      expect(commands.filter(c => c.op === "show_periodic_table").every(c => c.focus === false)).toBe(true);
      expect(commands.some(c => c.op === "show_periodic_table" && c.periods?.includes(e.period))).toBe(true);
    }
  });
  it("distinguishes an average atomic weight from a bracketed isotope number", () => {
    expect(periodicLesson(35).reply).toContain("not an exact neutron count");
    expect(periodicLesson(118).reply).toContain("isotope mass number");
    expect(() => periodicLesson(0)).toThrow(RangeError);
    expect(() => periodicLesson(119)).toThrow(RangeError);
  });
});
