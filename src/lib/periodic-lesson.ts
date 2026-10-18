import { PERIODIC_ELEMENTS } from "./periodic-table";
import type { ScenePlan } from "./ssp/schema";

/** A correct, local table tour for every element, including those without a Bohr model. */
export function periodicLesson(number = 6): ScenePlan {
  const element = PERIODIC_ELEMENTS.find(e => e.number === number);
  if (!element) throw new RangeError("Choose an atomic number from 1 to 118.");
  const e = element;
  const position = `Period ${e.period}${e.group ? `, Group ${e.group}` : `, ${e.series}`}`;
  const identity = `${e.name} has atomic number ${e.number}: every nucleus has ${e.number} protons. A neutral atom has ${e.number} electrons.`;
  const weight = e.weight.startsWith("[") ? `The bracketed ${e.weight} is an isotope mass number, not a standard atomic weight.` : `Its abridged atomic weight is ${e.weight}. This describes an average for natural isotopes, not an exact neutron count.`;
  const family = e.group ? `Group ${e.group} is a column. Elements in a group often have related chemical properties.` : `The ${e.series} are displayed below the main table to keep it compact. ${e.name} still belongs to Period ${e.period}.`;
  return {
    schemaVersion: 1, scope: "in_scope", language: "en", subject: "chemistry", supportLevel: "visual", capability: "atom",
    title: `${e.name} on the periodic table`, reply: `${identity} ${position}. ${weight}`,
    details: `${family} A period is a horizontal row. Atomic numbers increase across each period. The tile shows the atomic number, symbol, name and atomic weight or bracketed isotope mass number.`,
    steps: [
      { title: "Read the element tile", commands: [
        { op: "show_periodic_table", elements: [e.number], groups: [], periods: [], focus: false, marks: [{ kind: "circle", at: e.number }], caption: `${e.name} (${e.symbol}) · Atomic number ${e.number}` },
        { op: "speak", speaker: "simu", text: `${identity} ${weight}` },
      ] },
      { title: "Find its period", commands: [
        { op: "show_periodic_table", elements: [e.number], groups: [], periods: [e.period], focus: false, caption: `${e.name} is in Period ${e.period}`, marks: [{ kind: "circle", at: e.number }, { kind: "text", at: [.2, .25], text: `Period ${e.period} = horizontal row` }] },
        { op: "speak", speaker: "simu", text: `Find the highlighted row: Period ${e.period}. Atomic numbers increase from left to right across a period.` },
      ] },
      { title: "Find its family", commands: [
        { op: "show_periodic_table", elements: e.group ? [e.number] : PERIODIC_ELEMENTS.filter(item => item.series === e.series).map(item => item.number), groups: e.group ? [e.group] : [], periods: [], focus: false, caption: `${e.name} · ${position}`, marks: [{ kind: "circle", at: e.number }, { kind: "text", at: [.2, .25], text: e.group ? `Group ${e.group} = vertical column` : e.series! }] },
        { op: "speak", speaker: "simu", text: family },
      ] },
    ],
    assumptions: ["Electron counts describe neutral atoms."], limitations: ["This is a built-in table guide. Atomic weights are the table's abridged IUPAC 2022 values."], followUps: [],
  };
}
