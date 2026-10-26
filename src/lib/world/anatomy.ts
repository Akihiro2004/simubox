// The Anatomy Lab's body: which structures exist, which system each belongs
// to, what a layer setting shows, and a short fact sheet per structure.
// Shared by the server (what Gemini may name) and the client (rendering).
// Mesh data comes from scripts/build-anatomy.mjs (BodyParts3D, DBCLS).

export const ANATOMY_SYSTEMS = ["all", "skin", "muscular", "skeletal", "nervous", "cardiovascular", "respiratory", "digestive", "urinary", "endocrine"] as const;
export type AnatomySystem = (typeof ANATOMY_SYSTEMS)[number];
export type BodySystem = Exclude<AnatomySystem, "all">;

export const SYSTEM_LABELS: Record<AnatomySystem, string> = {
  all: "Whole body", skin: "Skin", muscular: "Muscles", skeletal: "Skeleton", nervous: "Nervous system", cardiovascular: "Heart and blood vessels",
  respiratory: "Lungs and airways", digestive: "Digestive system", urinary: "Kidneys and bladder", endocrine: "Hormone glands",
};

/** Peel order for the whole body: 0 skin, 1 muscles, 2 skeleton and organs, 3 organs only. */
export const DEPTH_LABELS = ["Skin", "Muscles", "Skeleton and organs", "Organs only"] as const;

export const STRUCTURES = {
  skin: { name: "Skin", system: "skin", what: "Your largest organ: it keeps germs and water out, and senses touch, heat and pain.", massG: 3300 },
  heart: { name: "Heart", system: "cardiovascular", what: "A muscular pump the size of a fist that pushes blood around the body.", massG: 330 },
  aorta: { name: "Aorta", system: "cardiovascular", what: "The body's biggest artery, carrying blood from the left ventricle to the whole body.", massG: null },
  arteries: { name: "Arteries", system: "cardiovascular", what: "Thick-walled vessels that carry blood away from the heart under pressure.", massG: null },
  veins: { name: "Veins", system: "cardiovascular", what: "Vessels that carry blood back to the heart, helped by valves and muscle squeezing.", massG: null },
  pulmonary_vessels: { name: "Pulmonary blood vessels", system: "cardiovascular", what: "Vessels between the heart and lungs, where blood picks up oxygen.", massG: null },
  trachea: { name: "Trachea and bronchi", system: "respiratory", what: "The windpipe and its branches (bronchi), carrying air down to the lungs.", massG: null },
  lung_right: { name: "Right lung", system: "respiratory", what: "The right lung has three lobes; it swaps oxygen and carbon dioxide with the blood.", massG: 660 },
  lung_left: { name: "Left lung", system: "respiratory", what: "The left lung has two lobes, leaving room for the heart.", massG: 540 },
  diaphragm: { name: "Diaphragm", system: "respiratory", what: "The dome-shaped muscle under the lungs; when it contracts and flattens, you breathe in.", massG: null },
  brain: { name: "Cerebrum", system: "nervous", what: "The cerebrum: thinking, memory, language, senses and voluntary movement.", massG: 1450 },
  cerebellum: { name: "Cerebellum", system: "nervous", what: "The 'little brain' that coordinates balance and smooth movement.", massG: null },
  brainstem: { name: "Brainstem", system: "nervous", what: "Connects brain and spinal cord and runs breathing and heartbeat automatically.", massG: null },
  spinal_cord: { name: "Spinal cord", system: "nervous", what: "The main cable of nerves running down the spine; it also handles quick reflexes.", massG: 30 },
  cranial_nerves: { name: "Cranial nerves", system: "nervous", what: "Nerves that leave the brain directly, such as the optic nerve from each eye.", massG: null },
  eyes: { name: "Eyes", system: "nervous", what: "Light-sensing organs that send images to the brain through the optic nerves.", massG: 15 },
  esophagus: { name: "Oesophagus", system: "digestive", what: "The food pipe: muscle waves push each swallow down to the stomach.", massG: 40 },
  stomach: { name: "Stomach", system: "digestive", what: "A stretchy muscular bag that mixes food with acid and enzymes.", massG: 150 },
  liver: { name: "Liver", system: "digestive", what: "The largest internal organ: it makes bile, stores energy and cleans the blood.", massG: 1800 },
  gallbladder: { name: "Gallbladder", system: "digestive", what: "Stores bile from the liver and squeezes it into the intestine to digest fat.", massG: 10 },
  pancreas: { name: "Pancreas", system: "digestive", what: "Makes digestive enzymes, and the hormones insulin and glucagon that control blood sugar.", massG: 140 },
  small_intestine: { name: "Small intestine", system: "digestive", what: "A long coiled tube where most food is digested and absorbed.", massG: 650 },
  large_intestine: { name: "Large intestine", system: "digestive", what: "Absorbs water and salts and is home to trillions of helpful bacteria.", massG: 370 },
  rectum: { name: "Rectum", system: "digestive", what: "The last part of the large intestine, holding waste until it leaves.", massG: null },
  kidney_right: { name: "Right kidney", system: "urinary", what: "Filters the blood, removing waste and extra water as urine.", massG: 155 },
  kidney_left: { name: "Left kidney", system: "urinary", what: "Filters the blood, removing waste and extra water as urine.", massG: 155 },
  ureters: { name: "Ureters", system: "urinary", what: "Two thin tubes carrying urine from the kidneys to the bladder.", massG: null },
  bladder: { name: "Urinary bladder", system: "urinary", what: "A stretchy bag that stores urine.", massG: 50 },
  adrenals: { name: "Adrenal glands", system: "endocrine", what: "Glands on top of the kidneys that release adrenaline and cortisol.", massG: 14 },
  skull: { name: "Skull", system: "skeletal", what: "Protects the brain and shapes the face; most of its bones are locked together.", massG: null },
  spine: { name: "Spine (vertebral column)", system: "skeletal", what: "A column of vertebrae that holds you up and protects the spinal cord.", massG: null },
  ribcage: { name: "Rib cage", system: "skeletal", what: "Twelve pairs of ribs and the breastbone, guarding the heart and lungs.", massG: null },
  shoulder_bones: { name: "Collarbones and shoulder blades", system: "skeletal", what: "Collarbones and shoulder blades, which attach the arms to the body.", massG: null },
  arm_bones: { name: "Arm bones (humerus, radius, ulna)", system: "skeletal", what: "The humerus (upper arm), radius and ulna (forearm).", massG: null },
  hand_bones: { name: "Hand bones", system: "skeletal", what: "27 bones in each hand, for grip and fine movements.", massG: null },
  pelvis: { name: "Pelvis (hip bones)", system: "skeletal", what: "The hip bones: they carry the upper body's weight to the legs.", massG: null },
  femur: { name: "Thigh bones (femur)", system: "skeletal", what: "The thigh bone, the longest and strongest bone in the body.", massG: null },
  leg_bones: { name: "Lower leg bones (tibia, fibula, kneecap)", system: "skeletal", what: "The tibia (shin), fibula and patella (kneecap).", massG: null },
  foot_bones: { name: "Foot bones", system: "skeletal", what: "26 bones in each foot, arched to spread your weight.", massG: null },
  biceps: { name: "Biceps (biceps brachii)", system: "muscular", what: "Bends the elbow by pulling the forearm up.", massG: null },
  triceps: { name: "Triceps (triceps brachii)", system: "muscular", what: "Straightens the elbow: it works opposite the biceps.", massG: null },
  deltoid: { name: "Deltoid", system: "muscular", what: "Caps the shoulder and lifts the arm out to the side.", massG: null },
  pectoralis: { name: "Chest (pectoralis major)", system: "muscular", what: "The chest muscle: it pulls the arm across the body.", massG: null },
  trapezius: { name: "Trapezius", system: "muscular", what: "Moves and steadies the shoulder blades and neck.", massG: null },
  abdominals: { name: "Abdominal muscles", system: "muscular", what: "Belly muscles that bend and twist the trunk and protect the organs.", massG: null },
  gluteus: { name: "Buttock muscles (gluteus)", system: "muscular", what: "Buttock muscles that straighten the hip when you stand, climb or run.", massG: null },
  quadriceps: { name: "Quadriceps (front thigh)", system: "muscular", what: "Four muscles on the front of the thigh that straighten the knee.", massG: null },
  hamstrings: { name: "Hamstrings (back thigh)", system: "muscular", what: "Muscles on the back of the thigh that bend the knee.", massG: null },
  calf: { name: "Calf muscles (gastrocnemius, soleus)", system: "muscular", what: "Lifts the heel so you can stand on tiptoe, walk and jump.", massG: null },
} as const satisfies Record<string, { name: string; system: BodySystem; what: string; massG: number | null }>;

export type StructureId = keyof typeof STRUCTURES;
export const STRUCTURE_IDS = Object.keys(STRUCTURES) as [StructureId, ...StructureId[]];

/** Whole-body facts (adult): ICRP Publication 89 reference values, standard anatomy texts. */
export const BODY_FACTS = { bones: 206, skeletalMuscles: "about 600", skeletonKg: 10.5, muscleKg: 29, bloodLitres: 5.3 } as const;

/** Mesh groups that hold the rest of a system (not individually named). */
export const GROUP_MESHES = { other_muscles: "muscular", other_bones: "skeletal" } as const satisfies Record<string, BodySystem>;

export type Look = "solid" | "ghost";

/** Bones shown faintly behind an organ system so its place in the body is clear. */
const FRAME: StructureId[] = ["skull", "spine", "ribcage", "pelvis"];

/**
 * What each mesh looks like for a layer setting; meshes not listed are not drawn.
 * Whole body: peel by depth. One system: that system solid, skin as a ghost, and
 * for organ systems the main bones ghosted too.
 */
export function anatomyLooks(system: AnatomySystem, depth: number): Map<string, Look> {
  const looks = new Map<string, Look>();
  const all = [...STRUCTURE_IDS, ...(Object.keys(GROUP_MESHES) as (keyof typeof GROUP_MESHES)[])];
  const sys = (id: string) => (id in STRUCTURES ? STRUCTURES[id as StructureId].system : GROUP_MESHES[id as keyof typeof GROUP_MESHES]);
  if (system === "all") {
    const d = Math.max(0, Math.min(3, Math.round(depth)));
    for (const id of all) {
      const s = sys(id);
      if (s === "skin") { looks.set(id, d === 0 ? "solid" : "ghost"); continue; }
      if (d === 1 && s === "muscular") looks.set(id, "solid");
      if (d >= 2 && s !== "muscular" && (d === 2 || s !== "skeletal")) looks.set(id, "solid");
    }
    return looks;
  }
  for (const id of all) if (sys(id) === system) looks.set(id, "solid");
  if (system !== "skin") looks.set("skin", "ghost");
  if (system !== "skeletal" && system !== "muscular" && system !== "skin") for (const id of FRAME) looks.set(id, "ghost");
  return looks;
}
