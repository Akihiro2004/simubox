# Light Lab model and audit

The lab uses a two-dimensional geometric ray tracer on a 5.6 × 3.2 m optical table. The room, controls, AI readouts and saved scenes use the same setup and cached trace.

## Corrections

- Rays beginning inside glass now start in that material, including total internal reflection. Boundary transitions sample the material on the outgoing side.
- Fresnel losses propagate along every segment. Source power is shared across source rays and wavelengths, so changing ray count does not create energy. Equal-index boundaries reflect zero light, including grazing incidence.
- Screen capture measures the fraction of total emitted source power reaching that screen. Image-construction rays are excluded.
- Reverse-travelling lens rays use the correct focal side. Plane-mirror images have equal object/image distances, unit magnification and virtual back-projections.
- Spherical mirror rendering and intersection geometry use the same bounded aperture. Large virtual-image constructions and optical axes are clipped to the table.
- Angles are measured from the surface normal. Equal incidence/reflection angles alone do not indicate a bug.

## Controls and AI

`show_optics` includes `plane_image` (element id `mirror`). Existing presets remain available.

`set_module` with `module: "optics"` additionally accepts `wavelengthNm` (380–780; null restores named colour), `reachM`, `reflections`, and `lighting` (`bright` or `dim`). Setting a named colour clears the wavelength override. Source type, spread, ray count, element positions/materials, focal length, object distance and RGB lamps remain adjustable.

`beam_wavelength`, `reflectance` and `screen_power` work with placeholders and `show_measurement`. Element arguments select the relevant surface or screen. `focus_camera` accepts optical element ids. Object targets must be image-forming lenses or mirrors.

The controls offer table and room views, wavelength/source controls, element positioning and an optional dim projection mode. The default room is bright, with readable mirrors, labelled posters, cabinets, spare lenses, equipment and stools.

## Model limits

- Lenses are ideal thin lenses with supplied effective focal lengths. Changing the surrounding medium does not recalculate their focal length from lens curvature.
- Spherical mirror ray intersections are geometric; image formula readouts are **paraxial estimates**. Wide-aperture rays can show spherical aberration.
- Image predictions concern the selected single element, rather than a compound optical system. Construction rays illustrate those predictions.
- White light is nine equal-power wavelength samples, not a continuous or perceptually calibrated spectrum. Beam brightness helps visibility and is not a radiance measurement.
- RGB projection uses additive channels and analytic sphere occlusion on a wall plane. It is a teaching diagram, rather than volumetric light transport.
- No diffraction, interference, polarization or bulk absorption model is included.

## Performance

Traces are cached by immutable setup identity and recomputed on edits rather than every frame. The tracer permits eight elements, 160 ray paths and 40 segments per path, with three generations of Fresnel branches and a relative power cutoff. Budget exhaustion is reported in the controls.

All beam cores, glows and direction triangles use three batched draws. Furniture is merged by material, table holes are instanced, ruler marks are batched, and generated geometry/textures are disposed on replacement. RGB shadows use one screen shader without three extra shadow maps. No added dependency or remote texture download is required.

## Verification and references

`tests/unit/optics-regressions.test.ts` covers material initialization, energy accounting, wavelength dispersion, reverse lenses, plane images, mirror aperture and finite clipped rendering buffers. `tests/unit/optics-integration.test.ts` exercises actual player commands, validation, measurements and scene round-trips, including older saves without the new optional settings.

Relevant model references: [OpenStax thin lenses](https://openstax.org/books/university-physics-volume-3/pages/2-4-thin-lenses), [OpenStax refraction](https://openstax.org/books/university-physics-volume-3/pages/1-3-refraction), and [plane-mirror image formation](https://www.physicsclassroom.com/class/refln/lesson-3/reflection-of-light-and-image-formation).
