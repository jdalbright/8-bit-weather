# North Carolina scenes — version 1

Four regional illustrations extend the original meadow and Raleigh scenes. Built-in Imagegen created the daylight scenes using the original meadow as the composition and style reference, then edited each daylight master into overcast and night lighting. No API key, image-generation CLI, or third-party photos were used. See [the exact prompts](prompts.md).

| Scene | Character | Example places |
| --- | --- | --- |
| Beach | Natural dunes, sea oats, Atlantic surf and gulls | Wilmington, Wrightsville Beach, Nags Head, Ocracoke |
| Coastal Plain | Flat pine woodland, reeds, broad slow water | Greenville, New Bern |
| Piedmont | Low wooded hills, oaks and meadow clearings | Durham, Greensboro, Charlotte |
| Blue Ridge | Rounded layered mountain ridges and a rocky creek | Asheville, Boone |

These are regional illustrations, not exact views from the selected coordinates. Raleigh retains its original artwork and 25 km selection radius. First use and places outside NC retain the meadow. The procedural experiment remains inactive.

## Files and registration

- PNG masters: `sources/scene-{region}-{day|overcast|night}-v1.png`.
- Delivery plates: `../../../public/art/scene-{region}-{day|overcast|night}-v1.webp` (from repository root: `public/art/`).
- All 12 delivery images are opaque 960×801 WebPs. Export with `node scripts/build-regional-art.mjs`; Sharp uses nearest-neighbor resizing and WebP quality 86 / effort 6. The new pack totals approximately 1,078 KiB.
- The shared station rotor `(195, 511)` and indicator `(229, 579)` remain in the same scene grid. Inland creek, broad river, and surf masks are traced conservatively inside their corresponding delivery artwork. Ripple targets follow their water layouts.
- Lighting variants preserve the daylight compositions; generative edits can vary individual pixels. Registration is reviewed in the rendered app at each lighting state and through dawn/dusk blending.

## Animated details

Beach uses separate clipped surf and shimmer layers, sea-oat sprites, and pale gulls. Coastal Plain uses slow currents without rocky eddies and reed sprites. Piedmont and Blue Ridge use a creek layout fitted to the new woodland paintings. Water taps retain the existing sound callback, with a surf-specific accessible label at the beach. Day/night lighting, weather, reduced motion, hidden-tab behavior, and offscreen pauses share the existing scene system.

## Offline geography and review

Selection uses bundled coordinates only; see [geographic sources and approximations](../../../src/data/README.md). Every lighting variant is precached by the existing PWA worker. The complete production output stays under a 3,000,000-byte CI ceiling.

The browser suite captures each of six scenes in three lighting states at 320, 390, 430, and 1280 px widths, checks station alignment and 44 px controls, measures actual changed water pixels against the rendered clip, and exercises motion preferences, hidden/offscreen pause, keyboard/touch discovery, and offline saved-place switching. Screenshots are written to `/tmp/8bit-weather-regions/`. The existing suite checks dawn/dusk and weather combinations, audio, saved preferences, and the controlled PWA update flow.

For a local artwork gallery, run the dev server and open `docs/design/nc-regions-v1/review.html`. No production deployment is part of this change.
