import { z } from "zod";

// Names, atomic numbers and abridged weights: IUPAC, 4 May 2022.
// https://iupac.org/wp-content/uploads/2022/07/IUPAC_Periodic_Table-04May22_CRA.pdf
// Brackets denote isotope mass numbers, not standard atomic weights.
const DATA = `H Hydrogen 1.0080
He Helium 4.0026
Li Lithium 6.94
Be Beryllium 9.0122
B Boron 10.81
C Carbon 12.011
N Nitrogen 14.007
O Oxygen 15.999
F Fluorine 18.998
Ne Neon 20.180
Na Sodium 22.990
Mg Magnesium 24.305
Al Aluminium 26.982
Si Silicon 28.085
P Phosphorus 30.974
S Sulfur 32.06
Cl Chlorine 35.45
Ar Argon 39.95
K Potassium 39.098
Ca Calcium 40.078
Sc Scandium 44.956
Ti Titanium 47.867
V Vanadium 50.942
Cr Chromium 51.996
Mn Manganese 54.938
Fe Iron 55.845
Co Cobalt 58.933
Ni Nickel 58.693
Cu Copper 63.546
Zn Zinc 65.38
Ga Gallium 69.723
Ge Germanium 72.630
As Arsenic 74.922
Se Selenium 78.971
Br Bromine 79.904
Kr Krypton 83.798
Rb Rubidium 85.468
Sr Strontium 87.62
Y Yttrium 88.906
Zr Zirconium 91.224
Nb Niobium 92.906
Mo Molybdenum 95.95
Tc Technetium [97]
Ru Ruthenium 101.07
Rh Rhodium 102.91
Pd Palladium 106.42
Ag Silver 107.87
Cd Cadmium 112.41
In Indium 114.82
Sn Tin 118.71
Sb Antimony 121.76
Te Tellurium 127.60
I Iodine 126.90
Xe Xenon 131.29
Cs Caesium 132.91
Ba Barium 137.33
La Lanthanum 138.91
Ce Cerium 140.12
Pr Praseodymium 140.91
Nd Neodymium 144.24
Pm Promethium [145]
Sm Samarium 150.36
Eu Europium 151.96
Gd Gadolinium 157.25
Tb Terbium 158.93
Dy Dysprosium 162.50
Ho Holmium 164.93
Er Erbium 167.26
Tm Thulium 168.93
Yb Ytterbium 173.05
Lu Lutetium 174.97
Hf Hafnium 178.49
Ta Tantalum 180.95
W Tungsten 183.84
Re Rhenium 186.21
Os Osmium 190.23
Ir Iridium 192.22
Pt Platinum 195.08
Au Gold 196.97
Hg Mercury 200.59
Tl Thallium 204.38
Pb Lead 207.2
Bi Bismuth 208.98
Po Polonium [209]
At Astatine [210]
Rn Radon [222]
Fr Francium [223]
Ra Radium [226]
Ac Actinium [227]
Th Thorium 232.04
Pa Protactinium 231.04
U Uranium 238.03
Np Neptunium [237]
Pu Plutonium [244]
Am Americium [243]
Cm Curium [247]
Bk Berkelium [247]
Cf Californium [251]
Es Einsteinium [252]
Fm Fermium [257]
Md Mendelevium [258]
No Nobelium [259]
Lr Lawrencium [262]
Rf Rutherfordium [267]
Db Dubnium [268]
Sg Seaborgium [269]
Bh Bohrium [270]
Hs Hassium [269]
Mt Meitnerium [277]
Ds Darmstadtium [281]
Rg Roentgenium [282]
Cn Copernicium [285]
Nh Nihonium [286]
Fl Flerovium [290]
Mc Moscovium [290]
Lv Livermorium [293]
Ts Tennessine [294]
Og Oganesson [294]`;

const ROWS = [
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2],
  [3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 6, 7, 8, 9, 10],
  [11, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 13, 14, 15, 16, 17, 18],
  Array.from({ length: 18 }, (_, i) => 19 + i),
  Array.from({ length: 18 }, (_, i) => 37 + i),
  [55, 56, 0, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86],
  [87, 88, 0, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118],
];

export const TABLE_SIZE = { width: 2400, height: 1500, left: 72, top: 230, step: 126, cell: 118 };
export const PERIODIC_ELEMENTS = DATA.split("\n").map((line, i) => {
  const [symbol, name, weight] = line.split(" ");
  const number = i + 1;
  const series = number >= 57 && number <= 71 ? "lanthanoids" : number >= 89 && number <= 103 ? "actinoids" : null;
  const row = series ? (series === "lanthanoids" ? 7 : 8) : ROWS.findIndex((r) => r.includes(number));
  const col = series ? number - (series === "lanthanoids" ? 57 : 89) + 3 : ROWS[row].indexOf(number);
  const period = series ? (series === "lanthanoids" ? 6 : 7) : row + 1;
  const group = series ? null : col + 1;
  return { number, symbol, name, weight, period, group, series, col, row };
});

export function elementPoint(number: number): [number, number] {
  const e = PERIODIC_ELEMENTS[number - 1];
  const s = TABLE_SIZE;
  return [(s.left + e.col * s.step + s.cell / 2) / s.width, (s.top + e.row * s.step + (e.series ? 46 : 0) + s.cell / 2) / s.height];
}

const AtomicNumber = z.number().int().min(1).max(118);
const Point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const Anchor = z.union([AtomicNumber, Point]).describe("atomic number 1..118 to anchor to an element, or [x,y] 0..1 across board from top left");
const Color = z.string().regex(/^#[0-9a-fA-F]{6}$/).optional();
export const TableMark = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("arrow"), from: Anchor, to: Anchor, color: Color }),
  z.object({ kind: z.literal("circle"), at: Anchor, radius: z.number().min(.01).max(.4).optional(), color: Color }),
  z.object({ kind: z.literal("text"), at: Point, text: z.string().min(1).max(65), color: Color }),
  z.object({ kind: z.literal("line"), points: z.array(Point).min(2).max(32), color: Color }),
]);
export const PeriodicTableFields = {
  elements: z.array(AtomicNumber).max(118).optional().describe("highlight these atomic numbers; [] clears"),
  groups: z.array(z.number().int().min(1).max(18)).max(18).optional(),
  periods: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  marks: z.array(TableMark).max(12).optional().describe("replaces board drawings; [] clears; omitted preserves"),
  caption: z.string().max(120).optional(),
};
export interface PeriodicTableState {
  elements: number[];
  groups: number[];
  periods: number[];
  marks: z.infer<typeof TableMark>[];
  caption: string;
}
export const EMPTY_TABLE: PeriodicTableState = { elements: [], groups: [], periods: [], marks: [], caption: "" };

export function tableSelection(state: PeriodicTableState): Set<number> {
  return new Set(PERIODIC_ELEMENTS.filter((e) => state.elements.includes(e.number) || (e.group !== null && state.groups.includes(e.group)) || state.periods.includes(e.period)).map((e) => e.number));
}

/** Board faces +x on the lab's left wall. Keep its camera inside the room. */
export function periodicTableCamera(aspect: number) {
  const distance = 5.3 * Math.max(1, 1.65 / Math.max(.25, aspect));
  // On wide screens, leave the right side for the lab's controls card.
  const z = aspect >= 1.25 ? -.3 : .2;
  return { target: [-3.92, 2.2, z] as [number, number, number], position: [-3.92 + distance, 2.2, z] as [number, number, number] };
}
