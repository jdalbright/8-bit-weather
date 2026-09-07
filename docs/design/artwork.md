# Artwork and design source

The visual source is `approved-concept.png`, approved in the planning conversation. It establishes the warm ivory panels, indigo text, violet active controls, pixel typography, landscape composition, hourly rail, daily rows, and three-item bottom navigation.

The production landscape images were created with the built-in Imagegen tool, then resized and encoded as WebP for delivery. All interactive text, weather values, controls, and forecasts are native HTML. Pixel SVG weather/utility icons and animated cloud sprites use a consistent stepped grid.

## Production prompts

**Daylight scene:** Extract the complete background art of the approved current-weather view: peach-to-butter-yellow sky, lavender mountains, pine trees, meadow, creek, and small weather station. Preserve the source pixel-art style and composition. Leave the upper sky empty for HTML weather text; remove all UI, lettering, values, sun, and clouds. Render fully opaque colored artwork with no transparency grid.

**Night scene:** Preserve the daylight scene's exact layout and objects. Change illumination to a dark indigo and violet sky, blue-violet mountains, deep teal meadow and pines, and silver-blue creek highlights. Keep the sky empty for animated moon and stars. No text or additional objects.

**Overcast scene:** Preserve the daylight composition. Use pale blue-gray sky, misty blue/lavender mountains, cool greens, subdued cloudy lighting, and a reflective creek. Leave clouds and precipitation to separate animated layers. No text or additional objects.

**Station correction, all three variants (built-in Imagegen):** Remove only the cup anemometer at the top of the weather-station mast, including cups, arms, and the skinny stalk above the collar. Reconstruct the mountain texture behind it. Preserve the pole below the collar, the shield, box, wiring, and every other landscape feature in position, scale, and color. Leave a bare mast for a separately animated rotor; add no replacement objects or text.

The corrected assets are `public/art/scene-day-v2.webp`, `scene-night-v2.webp`, and `scene-overcast-v2.webp`. Only the generated correction inside the source rectangle `(162, 474, 68, 55)` was composited into each original plate before WebP delivery encoding. This prevents unrelated generative changes to the station or landscape. The original plates are retained in `original-landscapes/` and are not shipped in the offline app shell.

The native grids are 960×800 for daylight and 960×801 for the other variants. The SVG detail layer uses the matching view box with `xMidYMax slice`, equivalent to the image's `object-fit: cover; object-position: center bottom`. Its rotor pivot is fixed at `(195, 511)`. Twelve discrete rotor frames animate the cups independently of that mounting point. Water highlights also use the artwork's coordinates. Browser regression tests verify attachment through every frame and across forecast and first-use crops at mobile and desktop widths.

## Deliberate implementation accommodations

- The image generator's transparent exports contained a baked-in checkerboard. Clean opaque landscape plates replace those rejected exports; clouds, celestial icons, stars, precipitation, water glints, and the anemometer animate independently above them.
- Touch controls are at least 44 pixels, and the landscape keeps sufficient height on narrow screens for readable current-weather text.
- Weather values, dates, weather labels, daylight, and temperature ranges are dynamic. Only the Today temperature bar has a current-temperature marker; other days do not display an invented measurement.
- Location selection, loading/error/offline states, Places, and Settings extend the approved component language to the required functional flows.
