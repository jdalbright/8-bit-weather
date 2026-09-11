# Raleigh oak artwork prompts

Built-in Imagegen; no API-key or CLI image generation was used.

## Tree extraction

Use case: background-extraction.
Asset type: an actual transparent PNG sprite layer for the existing Raleigh pixel-art weather scene.
Edit target: the supplied 960x801 landscape.
Extract ONLY the two large foreground oak trees at the far left and far right, including their leafy crowns, branches and trunks. Preserve the trees' exact original screen positions, scale, silhouettes, detailed crisp square-pixel texture and warm daylight colors. Keep the same 6:5 canvas/aspect and framing: left oak canopy begins around y=295, its trunk ends near y=580; right oak canopy begins around y=323 and trunk ends near y=580. These edge trees remain cropped by the outside canvas edges exactly as in the input. This is one transparent sprite atlas containing the separated left and right oak silhouettes in their original layout, NOT a new scene.
Remove ALL sky, skyline, hills, distant trees, smaller foreground pines, grass, flowers, ground, creek, station, wooden marker and other objects. The full space between and around the two foreground oak silhouettes must be genuine transparent alpha, including gaps between branches and leaves. No ground under roots. Do not fill the alpha with black, white, a gradient, or a drawn checkerboard.
Do not redraw or redesign the two oak trees. Preserve the source tree appearance as closely as possible. No added trees, no objects, text, labels, outlines, shadows or mockup framing. The output must be the actual transparent game sprite layer, ready to overlay on a separately restored background.

## Alpha retry (returned painted checkerboard; not usable as alpha)

Remove the gray checkerboard from this tree cutout image. Return a PNG with a real transparent alpha channel; all background pixels must have alpha 0. This image currently has a painted checkerboard, which is incorrect. Preserve only the two green pixel-art oak trees with their brown trunks. Preserve every existing tree pixel, position, scale, and canvas dimensions. Make the gaps among branches transparent too. Do not render a transparency checkerboard. Do not replace the background with a visible color. The result must be an actual transparent PNG ready for use as a game sprite.

## Clean daylight background

Use case: precise-object-edit.
Asset: clean background plate for a layered pixel-art game scene.
Edit target: the supplied original Raleigh landscape.
Remove ONLY the two LARGE FOREGROUND OAK TREES at the extreme left and right edges: their large leafy crowns, branches, and thick brown trunks. The left oak occupies approximately x=0..192,y=292..582 on the 960x801 source; the right oak occupies x=790..960,y=322..590. Reconstruct the empty warm sky and distant wooded parkland that would naturally be visible behind those trees. Where a trunk meets the ground, restore the grass behind it.
Preserve all other artwork, positions, colors, scale, sharp pixel texture and exact 6:5 framing. Do not change any pixels outside the removed oaks' regions. In particular keep the smaller dark pine near the station, all existing smaller midground trees, the Raleigh skyline, meadow flowers, station and bare mast, wooden stake, and ALL creek water, banks and rocks exactly where they are. The upper 35 percent and central 60 percent must remain identical to the source. No new objects. No changes to lighting. No softening, blur, clouds, birds, text, or UI. Output a fully opaque background at the original aspect, edge to edge. This is the empty-background companion to transparent oak sprites that will be composited back into their original places.

## Clean overcast background

Remove ONLY the two large foreground oak trees at the extreme left and right of this overcast Raleigh pixel-art landscape. Remove their crowns, branches and thick trunks and restore pale blue-gray sky, distant forest, small pines and meadow behind them. Left oak region x=0..193,y=295..590 and right oak x=790..960,y=320..590 on the 960x801 canvas. Keep smaller pine by the weather station. Preserve all other objects, exact positions and original cool overcast palette and sharp pixel texture. Preserve station, skyline, flowers and creek geometry exactly. No added objects, text, birds, clouds, change of lighting or camera. Same 6:5 canvas aspect. Fully opaque clean background plate for compositing separate oak sprites back on top.

## Clean night background

Remove ONLY the two large foreground oak trees at the extreme left and right of this nighttime Raleigh pixel-art landscape. Remove their crowns, branches and thick trunks and restore indigo-purple sky, distant forest, small pines and meadow behind them. Left oak region x=0..193,y=295..590 and right oak x=790..960,y=320..590 on the 960x801 canvas. Keep smaller pine by the weather station. Preserve all other objects, exact positions and original dark blue/teal/violet night palette and sharp pixel texture. Preserve station, lit skyline, flowers and creek geometry exactly. No added objects, text, birds, clouds, change of lighting or camera. Same 6:5 canvas aspect. Fully opaque clean background plate for compositing separate oak sprites back on top.
