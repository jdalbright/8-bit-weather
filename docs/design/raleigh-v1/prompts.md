# Raleigh artwork prompts

Mode: built-in Imagegen. No API key or CLI fallback was used. Delivery resizing and WebP encoding follow the original artwork workflow.

## Daylight

Reference and edit target: `public/art/scene-day-v2.webp`.

> Use case: precise-object-edit. Asset type: an opaque illustrated background plate for the existing 8-Bit Weather app. Create a Raleigh, North Carolina area version of the supplied original pixel-art landscape. The supplied image is both the style reference and the composition/edit target. Match its 6:5 landscape aspect and detailed, crisp square-pixel texture, warm peach-to-butter-yellow empty sky, saturated yellow-green grass, lavender atmospheric depth, and cozy retro game art. This is painted artwork, never procedural-looking geometric scenery.
>
> Change the regional landscape: replace all steep purple mountains with gentle low Piedmont wooded rises and a clearly recognizable, modestly scaled downtown Raleigh skyline viewed across green parkland. Suggest the real skyline with PNC Plaza's tall angular glass crown, the stepped block of Two Hannover Square, the rectangular Wells Fargo tower, and shorter warm masonry buildings. Place the compact skyline in the lower middle distance, roughly x=335..670, y=465..600 on a 960x800 layout. Tree line hides building bases. Keep the upper central 55 percent of the canvas clear for the app's live weather typography. Replace the tall foreground pines at the far left and right with mature broad-crowned oaks and a few subordinate Piedmont pines; keep trees near the outside edges so they frame the view. The result should evoke Raleigh's City of Oaks and its creek greenways with downtown visible in the distance. It is an artistic Raleigh composite, not a literal site survey. No mountain peaks.
>
> Critical layout invariants: preserve the original foreground creek's exact meandering route, banks, rocks and bright water positions in the bottom right, including the water around x=701,y=744. Preserve the small weather station's size, shape and exact position in the lower left; its bare mast ends at x=195,y=531, its instrument box at x=229,y=579. Keep the bare mast: NO rotor, NO cups, NO anemometer arms above the pole, because those are animated separately. Preserve the station's shield, box, cable, pole, wood marker and the nearby meadow. Preserve the original flowers, grassy foreground depth and creek geometry as closely as possible. Leave all existing animated layer anchor positions usable. Match the original composition and pixel scale instead of redesigning the foreground.
>
> Lighting: pleasant warm daylight, matching the reference's peach-gold sky and inviting green foreground. Render one finished scene only, edge to edge, fully opaque. No text, letters, signs, logos, interface, captions, border, sun, moon, stars, clouds, rain, snow, birds, people, or checkerboard. Weather and wildlife are separate app layers.

## Overcast

Edit target: the new Raleigh daylight PNG master.

> Use case: lighting-weather. Asset: overcast lighting variant of the supplied Raleigh pixel-art weather landscape. This image is the edit target. Make a pure lighting and color edit only; preserve the exact composition, image dimensions and 6:5 aspect ratio, square-pixel texture, every object silhouette and screen position. The Raleigh skyline, oak canopies, tree trunks, all meadow flowers, weather station with its BARE mast (no rotor or cups), wooden stake, all creek rocks, banks, and every bend in the water must remain in the same places at the same scales. Do not redraw, simplify, reposition, add, or remove objects.
>
> Replace the orange/gold empty sky with an empty pale blue-gray sky, softly lighter near the horizon. Convert warm daylight into soft cool overcast illumination: muted sage and forest greens, blue-lavender distant wooded ridges, subdued blue/stone skyline, slate-blue reflective creek with pale blue highlights, cool neutral station. Preserve readable detail, gentle atmospheric distance, and the original cozy pixel-art style. Buildings must remain the same identifiable Raleigh skyline and have no new signage. No nighttime window lights.
>
> This plate crossfades on top of the original day plate, so matching all geometry is the highest priority. Keep the upper central sky clear for native app text. No clouds, sun, moon, stars, precipitation, fog veils, birds, people, text, letters, interface, logos, border, or transparency checkerboard. Fully opaque, edge-to-edge finished artwork.

## Night

Image 1 / edit target: the new Raleigh daylight PNG master. Image 2 / lighting-only reference: `public/art/scene-night-v2.webp`.

> Use case: lighting-weather. Asset type: the night lighting plate for the Raleigh version of 8-Bit Weather. Image 1 is the Raleigh DAY plate and the ONLY composition/edit target. Image 2 is the original mountain scene at NIGHT and is solely a lighting and color reference; do not copy its mountains or foreground layout. Output the exact framing and 6:5 aspect ratio of Image 1.
>
> Change ONLY lighting and color in Image 1 to match the deep indigo/violet nighttime treatment of Image 2. Preserve every Raleigh skyline silhouette, all building positions and sizes, the exact oak canopy outlines, trunks, foreground flowers and blades, bare weather-station mast, shield, instrument box and wire, wooden stake, every creek rock and bank, and the original creek route. Do not add, remove, redraw, simplify, or shift objects. It must align during opacity crossfades with Image 1.
>
> Night illumination: dark navy-indigo sky softly transitioning to violet near the low horizon, lavender-blue distant skyline, deep teal and blue-green oak foliage and meadow, silver-blue highlights in the creek, cool blue-violet stone and station highlights. Maintain the small crisp square-pixel texture and layered atmospheric depth. Add a restrained scattering of small warm golden lit windows within the EXISTING downtown building facades and very subtle illumination on the existing angular tower crown; keep the landscape calm and dark enough to read as night. No excessive glow and no neon city. Keep the upper sky completely empty for app-rendered moon and stars and live weather text.
>
> Critical: the weather station's pole remains BARE with no anemometer, rotor, arms or cups on top. No stars, moon, sun, clouds, precipitation, fireflies, birds, people, text, signs, logos, interface, border, or checkerboard. Fully opaque edge-to-edge finished landscape only. No mountain peaks: retain the low Raleigh wooded horizon from Image 1.
