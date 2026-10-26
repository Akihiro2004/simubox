# Asset credits

## 3D models

Every room, prop and character in SimuBox is original and built in code from three.js primitives (`src/components/world/`), with one exception: the human body in the Anatomy Lab.

### Anatomy Lab body

- Source: BodyParts3D 4.0 (2013), part-of and is-a OBJ archives at 99% polygon reduction, https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/
- Author: The Database Center for Life Science (DBCLS), Japan.
- Licence: "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International" (the DBCLS README, updated 2025-02-27). The 2011 mesh files themselves say CC Attribution-Share Alike 2.1 Japan, so the derived file is shared under the same terms.
- Derived file: `public/anatomy/body.bin` + `src/lib/world/anatomy.generated.json`, made by `node scripts/build-anatomy.mjs <dir>` (groups ~1,500 element meshes into named structures, simplifies them with meshoptimizer, quantises to int16). Nothing is downloaded at build or run time.
- Leg nerves are not in the dataset; the reflex path in the nerve model is drawn procedurally.

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
