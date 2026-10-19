// Cell models built to real proportions from typical measurements (micrometres).
// Sources: Alberts et al., Molecular Biology of the Cell (6th ed.); BioNumbers
// (Milo & Phillips, Cell Biology by the Numbers, 2015). Cells vary a lot; these
// are typical values for each cell type (human cells unless stated).

export const CELL_KINDS = ["animal", "plant", "bacteria", "red_blood_cell", "neuron", "muscle", "epithelial", "sperm", "egg", "root_hair", "guard_cell", "yeast", "amoeba"] as const;
export type CellKind = (typeof CELL_KINDS)[number];

export const CELL_NAMES: Record<CellKind, string> = {
  animal: "Animal cell", plant: "Plant cell", bacteria: "Bacterium (E. coli)", red_blood_cell: "Red blood cell", neuron: "Nerve cell (neuron)", muscle: "Muscle fibre",
  epithelial: "Ciliated epithelial cell", sperm: "Sperm cell", egg: "Egg cell", root_hair: "Root hair cell", guard_cell: "Guard cells", yeast: "Yeast (fungus)", amoeba: "Amoeba (protist)",
};
export const CELL_GROUPS: { name: string; kinds: CellKind[] }[] = [
  { name: "Typical cells", kinds: ["animal", "plant", "bacteria"] },
  { name: "Specialised animal cells", kinds: ["red_blood_cell", "neuron", "muscle", "epithelial", "sperm", "egg"] },
  { name: "Specialised plant cells", kinds: ["root_hair", "guard_cell"] },
  { name: "Microbes", kinds: ["yeast", "amoeba"] },
];

export interface Organelle {
  id: string;
  name: string;
  job: string;
  color: string;
}

const O = (id: string, name: string, job: string, color: string): Organelle => ({ id, name, job, color });

export const ORGANELLES = {
  membrane: O("membrane", "Cell membrane", "A thin skin that controls what goes in and out.", "#f6b5c8"),
  wall: O("wall", "Cell wall", "A stiff outer layer that gives plant cells their box shape.", "#86c06c"),
  cytoplasm: O("cytoplasm", "Cytoplasm", "Jelly that fills the cell, where many reactions happen.", "#fde7ef"),
  nucleus: O("nucleus", "Nucleus", "The control centre; it holds the DNA instructions.", "#8b7fd8"),
  mitochondria: O("mitochondria", "Mitochondria", "Power stations that release energy from food.", "#f59e6b"),
  ribosomes: O("ribosomes", "Ribosomes", "Tiny builders that make proteins.", "#64748b"),
  er: O("er", "Endoplasmic reticulum", "Folded tubes that carry and help make proteins.", "#7dc4f0"),
  golgi: O("golgi", "Golgi body", "Packs and ships proteins around and out of the cell.", "#f2c14e"),
  lysosomes: O("lysosomes", "Lysosomes", "Small bags of enzymes that break down waste and worn-out parts.", "#e879a6"),
  vacuole: O("vacuole", "Vacuole", "A storage bag for water and nutrients.", "#a5d8ff"),
  chloroplasts: O("chloroplasts", "Chloroplasts", "Use sunlight to make food (photosynthesis).", "#3fa34d"),
  nucleoid: O("nucleoid", "DNA (nucleoid)", "Bacteria keep their DNA loose, with no nucleus.", "#8b7fd8"),
  flagellum: O("flagellum", "Flagellum", "A whip-like tail that pushes the cell along.", "#c69a6d"),
  haemoglobin: O("haemoglobin", "Haemoglobin", "Red protein filling the whole cell (about 270 million molecules) that carries oxygen.", "#dc2626"),
  dendrites: O("dendrites", "Dendrites", "Branches that collect signals from other nerve cells.", "#a78bfa"),
  axon: O("axon", "Axon", "A long cable that carries the signal away from the cell body; up to about 1 m long.", "#7c3aed"),
  myelin: O("myelin", "Myelin sheath", "Fatty insulation around the axon. Signals jump between its gaps, which makes them much faster.", "#fde68a"),
  terminals: O("terminals", "Axon terminals", "Endings that pass the signal to the next cell across a synapse.", "#c4b5fd"),
  acrosome: O("acrosome", "Acrosome", "A cap of enzymes that digests a way through the egg's coat.", "#93c5fd"),
  midpiece: O("midpiece", "Midpiece", "Packed with spiralled mitochondria that power the tail.", "#fdba74"),
  zona: O("zona", "Zona pellucida", "A thick jelly coat around the egg that sperm must get through.", "#e9d5ff"),
  corona: O("corona", "Corona radiata", "Follicle cells that surround and protect the egg.", "#fcd34d"),
  myofibrils: O("myofibrils", "Myofibrils", "Bundles of protein filaments that slide past each other to contract; their pattern makes the stripes.", "#f87171"),
  cilia: O("cilia", "Cilia", "Hundreds of tiny hairs that beat together to sweep mucus along.", "#f9a8d4"),
  root_hair: O("root_hair", "Root hair", "A long thin outgrowth that gives a big surface for taking in water and minerals.", "#d6d3d1"),
  stoma: O("stoma", "Stoma (pore)", "The gap between the guard cells: open, it lets carbon dioxide in and water vapour out.", "#94a3b8"),
  contractile_vacuole: O("contractile_vacuole", "Contractile vacuole", "Collects extra water and squirts it out, so the cell doesn't burst.", "#67e8f9"),
  food_vacuoles: O("food_vacuoles", "Food vacuoles", "Bubbles where swallowed food is digested.", "#fde68a"),
  pseudopodia: O("pseudopodia", "Pseudopodia", "'False feet': flowing bulges used to crawl and to engulf food.", "#bef264"),
  bud: O("bud", "Bud", "A daughter cell growing out of the parent: yeast reproduces by budding.", "#fef3c7"),
  capsule: O("capsule", "Capsule (some strains)", "A slimy outer coat that protects some bacteria; many E. coli strains don't have one.", "#d9f99d"),
} as const;
export type OrganelleId = keyof typeof ORGANELLES;

export const CELL_PARTS: Record<CellKind, OrganelleId[]> = {
  animal: ["membrane", "cytoplasm", "nucleus", "mitochondria", "ribosomes", "er", "golgi", "lysosomes", "vacuole"],
  plant: ["wall", "membrane", "cytoplasm", "nucleus", "chloroplasts", "mitochondria", "er", "golgi", "vacuole", "ribosomes"],
  bacteria: ["capsule", "wall", "membrane", "cytoplasm", "nucleoid", "ribosomes", "flagellum"],
  red_blood_cell: ["membrane", "haemoglobin"],
  neuron: ["membrane", "nucleus", "er", "mitochondria", "dendrites", "axon", "myelin", "terminals"],
  muscle: ["membrane", "nucleus", "myofibrils", "mitochondria"],
  epithelial: ["membrane", "nucleus", "golgi", "mitochondria", "cilia"],
  sperm: ["membrane", "acrosome", "nucleus", "midpiece", "mitochondria", "flagellum"],
  egg: ["corona", "zona", "membrane", "cytoplasm", "nucleus"],
  root_hair: ["wall", "membrane", "vacuole", "nucleus", "mitochondria", "root_hair"],
  guard_cell: ["wall", "membrane", "nucleus", "vacuole", "chloroplasts", "stoma"],
  yeast: ["wall", "membrane", "nucleus", "vacuole", "mitochondria", "bud"],
  amoeba: ["membrane", "cytoplasm", "nucleus", "contractile_vacuole", "food_vacuoles", "pseudopodia"],
};

/** Typical sizes (µm) and real counts. "shown" counts are what the model draws. */
export const CELL_SCALE = {
  animal: { note: "Real proportions. A real cell has about 1,000 mitochondria (160 shown) and about 10 million ribosomes (2,600 shown, drawn 5× bigger).", size: [22, 18, 18], nucleus: 8, mitochondrion: [0.5, 2], mitochondria: { real: "about 1,000", shown: 160 }, lysosomes: { real: "a few hundred", shown: 45 }, ribosomes: { real: "about 10 million", shown: 2600, enlarged: 5 }, bar: 5 },
  plant: { note: "Real proportions. A real cell has 50 to 100 chloroplasts (80 shown) and millions of ribosomes (2,200 shown, drawn 5× bigger).", size: [60, 35, 35], nucleus: 10, mitochondrion: [0.6, 1.5], vacuoleShare: "up to 80–90%", chloroplast: [5, 2.5], chloroplasts: { real: "50 to 100", shown: 80 }, mitochondria: { real: "a few hundred", shown: 70 }, ribosomes: { real: "millions", shown: 2200, enlarged: 5 }, bar: 10 },
  red_blood_cell: { size: [18, 8, 8], bar: 2, note: "Exact biconcave shape (Evans & Fung): 7.8 µm across, 0.8 µm thick in the middle, 2.6 µm at the rim. Seen face-on and edge-on. No nucleus or mitochondria: more room for haemoglobin." },
  neuron: { size: [600, 160, 160], bar: 50, note: "Real lengths: cell body 25 µm and one full 400 µm myelin segment. The axon (2 µm), myelin (4 µm) and dendrites are drawn 3× thicker so you can see them. A real motor axon runs on for up to 1 m before its terminals (shown after the break)." },
  muscle: { size: [160, 50, 50], bar: 10, note: "A 160 µm piece of one skeletal muscle fibre (real fibres are millimetres to centimetres long): 1.5 µm myofibrils, 2.5 µm sarcomeres (the stripes), nuclei at the edge." },
  epithelial: { size: [8, 28, 8], bar: 5, note: "Airway lining cell 22 µm tall with 200 cilia 6 µm long (real cells have 200–300); mitochondria cluster under the cilia that use their energy." },
  sperm: { size: [60, 3, 1.5], bar: 5, note: "Real proportions: 5 µm head, 5 µm midpiece with 60 mitochondria wound round it, 50 µm tail." },
  egg: { size: [176, 176, 176], bar: 20, note: "Real proportions: 120 µm across (one of the few human cells you could just see) plus a 15 µm zona pellucida. Shown with its nucleus, as before ovulation." },
  root_hair: { size: [290, 30, 30], bar: 20, note: "Root hair 12 µm wide, shown 250 µm long; real ones grow to 1–1.5 mm. Large vacuole, no chloroplasts (no light underground)." },
  guard_cell: { size: [28, 45, 12], bar: 10, note: "Two kidney-shaped cells about 45 µm long around an open pore. Unlike other leaf-surface cells, guard cells have chloroplasts." },
  yeast: { size: [9, 5, 5], bar: 2, note: "Baker's yeast: a 5 µm cell with a bud growing from it. Real proportions; its mitochondria form a branching network." },
  amoeba: { size: [600, 120, 360], bar: 100, note: "Amoeba proteus is about 0.5 mm long, big enough to see as a speck. Its shape keeps changing as it crawls." },
  bacteria: { note: "Real proportions, flagella included. A real cell has about 20,000 ribosomes (2,400 shown, drawn 2× bigger); DNA and flagella are drawn thicker so you can see them.", size: [2, 0.8, 0.8], flagellum: 6, flagella: { real: "about 4 to 8", shown: 5 }, ribosomes: { real: "about 20,000", shown: 2400, enlarged: 2 }, bar: 1 },
} as const;

export const CELL_SUMMARY: Record<CellKind, string> = {
  animal: "About 20 µm across: soft and roundish, with a big nucleus, hundreds of mitochondria and no cell wall.",
  plant: "About 60 µm long: a stiff wall, a central vacuole filling most of the cell, and chloroplasts lining the edges.",
  bacteria: "E. coli is about 2 µm long, ten times smaller than an animal cell, with no nucleus: its DNA is a loose tangle.",
  red_blood_cell: "A dimpled disc packed with haemoglobin: the shape gives a big surface for oxygen and lets it bend through narrow capillaries.",
  neuron: "Carries electrical signals: dendrites collect them, the long axon sends them on, and myelin makes them fast.",
  muscle: "One long cell with many nuclei, filled with myofibrils that shorten to pull. Plenty of mitochondria supply the energy.",
  epithelial: "Lines the airways. Its cilia beat in waves to sweep mucus and trapped dust up and out of the lungs.",
  sperm: "Built to swim: a streamlined head carrying DNA, enzymes to get into the egg, and a tail powered by mitochondria.",
  egg: "A huge cell full of nutrients for the early embryo, protected by a jelly coat and a ring of follicle cells.",
  root_hair: "A long hair reaching between soil particles: a large surface to absorb water and minerals.",
  guard_cell: "A pair of guard cells changes shape to open and close the stoma, controlling gas exchange and water loss.",
  yeast: "A single-celled fungus with a nucleus, a cell wall and a vacuole. It reproduces by budding.",
  amoeba: "A single-celled protist that crawls with pseudopodia, engulfs food into food vacuoles and pumps out water.",
};
