# Asset credits

## 3D models

Every room, prop and character in SimuBox is original and built in code from three.js primitives (`src/components/world/`). No third-party model, texture or animation files are bundled, so there are no asset licences to track.

The asset catalog (`src/lib/world/catalog.ts`) is the only list of objects the AI may spawn. Each entry has an id, size in metres, collider, mass and default physics. If CC0 GLB models (for example from Kenney, KayKit or Quaternius) are added later, record the source URL, author, licence and original filename for each here, and normalise scale and colours to match the existing style.

## Data

- Molecule bond lengths and angles: NIST Computational Chemistry Comparison and Benchmark Database (CCCBDB), experimental geometries. US Government work.
- Element mass numbers: most abundant stable isotope, standard reference values.

## Fonts and icons

- Nunito, SIL Open Font License 1.1 (via `next/font/google`). SF Pro Rounded is used instead where the device has it.
- Lucide icons, ISC licence.

## Code libraries

Next.js (MIT), React (MIT), three.js (MIT), @react-three/fiber, drei and rapier (MIT), Rapier physics (Apache 2.0), Zod (MIT), Zustand (MIT), @google/genai (Apache 2.0), Firebase JS SDK and Admin SDK (Apache 2.0), Tailwind CSS (MIT).

No code from other open-source science apps was copied into this project.
