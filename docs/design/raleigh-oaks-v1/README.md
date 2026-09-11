# Raleigh oak sprites

The two foreground oaks are now independent raster assets with genuine alpha,
eight discrete poses, and day/overcast/night palettes. `RaleighOaks.tsx` plays
the strips in the shared 960×801 scene, before the weather station and wildlife.
Trunks and branches stay fixed; five or six foliage clusters per tree move in
staggered pixel steps over a shaded inner canopy. These are prepared raster animation frames, not a transform applied to
the entire background. The poses are prepared by deterministic pixel processing, rather than newly
hand-drawn tree artwork.

## Reusable files

- Transparent PNG masters: `sources/oak-{left|right}-{day|overcast|night}.png`.
- Runtime strips: `public/art/raleigh-oaks/oak-{left|right}-{day|overcast|night}.webp`.
- Each pose is 240×320 pixels; each horizontal strip has eight poses (1920×320),
  with transparent frame padding to prevent bleed during scene scaling.
- Stage placements: left `(-8,280)`, right `(728,280)`. Original edge clipping is
  intentional; these are the scene's two edge oaks, not full freestanding trees.
- The atlas metadata is in `public/art/raleigh-oaks/atlas.json`.

The existing runtime Raleigh plate paths now contain repaired backgrounds with
the foreground oaks removed. Original opaque paintings remain unchanged in
`docs/design/raleigh-v1/`. Only the edge regions were composited from the new
background repairs; the skyline, station and creek geometry is retained.
The foreground PNG masters use original painting pixels in each lighting state.
A day-image color mask separates the warm sky from the edge trees; the lower
edge cutouts include stationary foliage where the oaks meet the midground.

## Preparation

The initial Imagegen tree extraction was rejected visually. Imagegen also
reconstructed hidden scenery, which is retained only behind the tree masks. Its alpha
requests twice returned an opaque painted checkerboard. With the user's explicit
permission, deterministic image processing removed neutral checkerboard pixels,
exported real RGBA PNGs. The revised pipeline segments the original painting
directly, preserves its three lighting palettes, and bakes eight foliage poses. The supplied bird pack was never processed by Imagegen
or this script. Original prompts and generated source files are retained here.

Rebuild with `node scripts/build-raleigh-oaks.mjs` (existing Sharp dependency).
Runtime WebP strips retain alpha and use quality 80 to fit the existing 3 MB
offline budget; PNG masters preserve the prepared pixels losslessly.

The loop takes eight seconds in gentle wind and six seconds at maximum illustrated
wind strength. Upper leaf clusters move only one source pixel horizontally in
two staggered poses; six of the eight poses are neutral. Lower foliage, trunks
and branches remain still. Left/right phases differ; all lighting layers within a tree stay
synchronized. Calm, reduced-motion, power-saving, hidden and offscreen states use
the neutral pose. Palette layers blend with the existing scene lighting.
