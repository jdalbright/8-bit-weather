# Raleigh stream: continuous downstream flow

## Research and correction

The previous four-pose version translated a non-periodic painting by 0, 2, 4,
then 6 pixels before resetting to zero. That reset was a visible upstream jump.
Checking that two frames differed did not verify the direction at the loop seam.

The relevant rendering principles are:

- Scroll a repeating texture along the flow direction. A complete texture-period
  translation produces the same image, so the next loop can continue forward.
  [Directional Flow, Jasper Flick](https://catlikecoding.com/unity/tutorials/flow/directional-flow/).
- Resetting a non-periodic distortion introduces a discontinuity. That technique
  requires blending phases to hide the reset; reversing progression causes
  back-and-forth motion. This implementation instead uses a periodic tile.
  [Texture Distortion: Seamless Looping](https://catlikecoding.com/unity/tutorials/flow/texture-distortion/).
- Check texture joins in a tiled preview, and retain sharp pixel sampling.
  [Aseprite Tiled Mode](https://aseprite.com/docs/tiled-mode/) and
  [MDN image rendering](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/image-rendering).

## Implementation

`scripts/build-raleigh-water.mjs` samples five subdued colors from a water-only
32×16 patch in each existing Raleigh lighting plate at (732,773). It draws
irregular, open horizontal streaks, wrapping across a 64×32 periodic PNG.
The earlier mirrored sample created repeated ring shapes; this texture has no
mirrored geometry or closed outlines. The three tiny tiles are bundled locally under
`public/art/raleigh-water/`. The supplied bird artwork is not processed.

`RaleighRiverSurface.tsx` repeats each tile in an SVG pattern. CSS advances the
pattern through 32 integer-pixel steps over 10–12 seconds. The upstream bend
moves (-64,0) per period; the middle and foreground move (64,32). All directions
follow the creek downstream, and the texture at a whole-period offset is
identical to the starting texture. There is no reverse or alternate playback.
Soft overlap masks blend the flow directions through the bend. Raleigh has its
own wider waterline, covering the left bend and the full foreground channel.
A water-color coverage mask excludes green banks and neutral stones within that
outline, while filling enclosed reflection gaps up to 64 pixels, including the
59-pixel foreground glint that otherwise stayed bright white. Both masks remain fixed. The underlying painting remains partially visible
for local shading; the moving texture supplies the current.

Day, overcast and night tiles blend with scene lighting. Raleigh rain uses small,
broken horizontal marks that fade while drifting downstream. This replaces the
large expanding outlined rings, which looked disconnected from the current.
Intentional tap ripples remain. Other regions keep their existing rain effects.
Reduced motion, native power saving, hidden and offscreen states pause
CSS playback. No new dependencies or public settings were added. Delivery is a
local preview, with assets ready for offline web and native app bundles.

## Validation

The browser regression renders the production texture, pattern and CSS at 1:1
scale. It compares frame 31 → 32 → 33 for all three lighting tiles and all three
reaches. Every pixel in the interior must match the preceding frame shifted by
its downstream step, including the last-to-first transition. This catches the
specific backward-snap failure that the earlier two-screenshot check missed.
Scene tests separately check visible flow, fixed banks, lighting, mobile/desktop
crops, motion controls and non-Raleigh regression.
