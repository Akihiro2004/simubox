# Outdoor court settings

The 66 m court retains its original coordinates and 5 m markings. Earth now sits on a bounded landscaped campus with pedestrian routes, planted banks and seasonal-colour beds. Repeated planting and rocks use static instances; the planet backdrop uses one small generated texture and disposes it on unmount. These settings add no image downloads or animation loops.

Flights fit their projected launch/path/guide bounds in the available viewport. Portrait screens look partly along the track rather than framing a wide horizontal path inside an oversized sphere. Tests project launch, apex, landing and guide points back into the safe screen area across five aspect ratios and multiple ranges.

Rocky-world craters share the terrain footprint and surface elevation. Their full outer rims, including a 1.2 m edge clearance, stay inside the map and clear of the court. Giant-planet decks reject crater decorations. Lunar terrain retains its own existing merged crater geometry.

The Moon terrain, crater layout and distant Earth remain unchanged. Other rocky planets use an instrumented test station with rock fields and low terrain banks. Gas and ice giants use a clearly labeled gravity simulation deck with a stylized remote planet backdrop. They never imply a solid surface on Jupiter, Saturn, Uranus or Neptune. The views are teaching illustrations, not physically scaled landing sites or engineering proposals.

All launches retain the existing idealized constant-gravity, no-air-drag model. In particular Mars and Venus atmospheric drag, Venus heat/pressure, and giant-planet atmospheres are not simulated. The controls and station plaques state the abstraction. Planetary presets disallow Earth vegetation even when a later command changes colours. Template Earth furniture is unmounted, without deleting the learner's scene data. Switching back restores it.

The named gravity controls select Earth, Moon, Mars or Jupiter scenery. Zero gravity and multiples of Earth gravity do not infer a location. Mercury cannot be inferred from gravity because its gravity is almost identical to Mars. All other planet settings are available through `set_environment` and documented in the director prompt.

Scientific references:

- [NASA Jupiter facts](https://science.nasa.gov/jupiter/jupiter-facts/): gas giant, no true surface, cloud bands and Great Red Spot.
- [NASA Mars facts](https://science.nasa.gov/mars/facts/): rocky terrain and thin atmosphere.
- [NASA Solar System facts](https://science.nasa.gov/solar-system/solar-system-facts/): terrestrial planets, gas giants and ice giants.

Validation covers preset invariants, restoration of Earth, automatic Jupiter routing including colour-only AI commands, and desktop/phone switching among Earth, Mars, Moon and Jupiter. Software-rendered browser checks do not establish physical low-end-device frame rates.
