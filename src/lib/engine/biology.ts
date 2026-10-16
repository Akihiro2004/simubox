// Labelled cell models (schematic, not to scale). Positions are in a unit
// cell of radius ~1.6 so the renderer can lay parts out deterministically.

export const CELL_KINDS = ["animal", "plant", "bacteria"] as const;
export type CellKind = (typeof CELL_KINDS)[number];

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
  vacuole: O("vacuole", "Vacuole", "A storage bag for water and nutrients.", "#a5d8ff"),
  chloroplasts: O("chloroplasts", "Chloroplasts", "Use sunlight to make food (photosynthesis).", "#3fa34d"),
  nucleoid: O("nucleoid", "DNA (nucleoid)", "Bacteria keep their DNA loose, with no nucleus.", "#8b7fd8"),
  flagellum: O("flagellum", "Flagellum", "A whip-like tail that pushes the cell along.", "#c69a6d"),
  capsule: O("capsule", "Capsule", "A slimy outer coat that protects the bacterium.", "#d9f99d"),
} as const;
export type OrganelleId = keyof typeof ORGANELLES;

export const CELL_PARTS: Record<CellKind, OrganelleId[]> = {
  animal: ["membrane", "cytoplasm", "nucleus", "mitochondria", "ribosomes", "er", "golgi", "vacuole"],
  plant: ["wall", "membrane", "cytoplasm", "nucleus", "chloroplasts", "mitochondria", "er", "golgi", "vacuole", "ribosomes"],
  bacteria: ["capsule", "wall", "membrane", "cytoplasm", "nucleoid", "ribosomes", "flagellum"],
};

export const CELL_SUMMARY: Record<CellKind, string> = {
  animal: "Animal cells are soft and roundish, with a nucleus and no cell wall.",
  plant: "Plant cells have a cell wall, chloroplasts for photosynthesis and one big vacuole.",
  bacteria: "Bacteria are much smaller, with no nucleus: their DNA floats in the cytoplasm.",
};
