# Local verification — September 9, 2026

- Type checking, ESLint, production build, and `git diff --check`: passed.
- Client unit tests: 162 passed. Server tests: 22 passed, 3 opt-in live API tests skipped. Native Node ESM smoke check: passed.
- Full Playwright suite: 153 passed, 9 skipped, in Chromium and WebKit. Skips cover existing platform-specific cases and Chromium-only service-worker lifecycle checks.
- Full production output: 2,313.5 KiB, below the 3,000,000-byte ceiling. Workbox generated a 55-entry precache, including all 18 landscape plates. Offline switching through all six saved landscape types passed after a reload.
- All 12 new PNG masters are present. All 12 production WebPs decode as opaque 960×801 images; combined size 1,104,304 bytes.
- Captured and reviewed six scenes × three lighting states × four widths (320, 390, 430, 1280). Browser tests also verify visible water movement within the SVG clips, station alignment, 44 px controls, keyboard/touch discoveries, reduced motion, hidden-tab pause, and offscreen pause. Existing weather/solar transition and PWA update regression tests passed.
- Local artwork gallery: all 12 images loaded at the expected dimensions; no page errors.

Evidence screenshots are in `/tmp/8bit-weather-regions/`, including per-browser captures, four `review-{width}.png` sheets, and `artwork-gallery.png`. These are local browser checks, not physical-device measurements. Vite reports one 543 kB JavaScript chunk (165 kB gzip) because the geographic map is bundled for offline use; the full asset budget passes.

The original Raleigh/meadow delivery files and the archived procedural experiment are unchanged. Nothing was deployed or published.
