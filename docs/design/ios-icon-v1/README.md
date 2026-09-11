# Pixel sun with native Liquid Glass

The iOS target now includes `ios/App/App/PixelSun.icon`, authored with Icon Composer
and compiled by Xcode 26.6. Open that document in Icon Composer to adjust materials
or inspect appearances. `preview-default.png` is the original Composer export (build 1).
`preview-build3-compiled.png` is the current compiled 120px fallback icon.

## Design

The sun silhouette, face, palette, placement, and pixel grid come from the existing
`public/icon.svg`. Three transparent 1024 × 1024 layers separate that geometry:

- `01-rays`: amber rays in the rear group, with 70% translucency and 15% neutral shadow.
- `02-sun`: brown stepped rim and yellow body in the front group, with 65% translucency and 18% neutral shadow.
- `03-face`: original pixel eyes and mouth, above the body in the same group, with glass effects disabled for legibility.

The source's painted highlight and lower-right shading are omitted so native
lighting provides highlights and depth. The background uses an automatic gradient
based on the original warm cream (`#fff7e8`). The system supplies the outer icon
mask. Group and layer arrays in the document are ordered front to back.

`layers/` retains the SVG sources and matching lossless PNG imports. The PNGs were
rasterized using the existing `sharp` dependency at the full SVG canvas resolution.
The runtime copies are inside `PixelSun.icon/Assets/`.

## Integration and verification

The `.icon` document is an app-target resource alongside the asset catalog. Both
Debug and Release select `ASSETCATALOG_COMPILER_APPICON_NAME = PixelSun`. The existing
flat `AppIcon.appiconset` is retained in the repository but is no longer selected as
the primary icon. Xcode generates the flattened images from the layered document.
PWA icons are unchanged.

Initial build 1 verification on September 11, 2026 (later revisions below):

- Default, dark, and monochrome appearances visually inspected in Icon Composer.
- Default PNG exported directly by Icon Composer and visually inspected.
- Generic iOS Simulator Debug build succeeded with Xcode 26.6 and deployment target 17.0.
- Compiled `Assets.car` contains two `IconGroup` entries and an `IconImageStack` for
  each of light, dark, and tintable appearances, plus all three source images.
- Compiled app Info.plist selects `AppIcon` as its primary icon.
- Xcode project plist syntax and `git diff --check` passed.

After the user requested installation, the signed Debug device build passed,
including strict signature verification. CoreDevice confirmed installation on
Jake’s iPhone (iPhone 17 Pro) and successful launch on September 11, 2026.
Device build log: `/tmp/eightbit-glass-icon-device-build.log`.

The user later supplied a Home Screen screenshot confirming the updated artwork
(see below). Wallpaper interactions, motion effects, and runtime fallback on
pre-iOS-26 devices have not been visually verified. No release or deployment was
performed.

Build command (run from repository root):

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/eightbit-glass-icon-derived \
  -clonedSourcePackagesDirPath /tmp/eightbit-ios-packages \
  -disableAutomaticPackageResolution CODE_SIGNING_ALLOWED=NO build
```

References: [Apple Icon Composer](https://developer.apple.com/icon-composer/)
and [Create icons with Icon Composer](https://developer.apple.com/videos/play/wwdc2025/361/).

## Follow-up: icon still appeared unchanged

The user reported that the icon looked unchanged after the first installation.
Inspection confirmed that build 1 included the glass image stacks and a glass-rendered
small PNG; this does not establish what SpringBoard actually displayed. CoreDevice
reported iOS 27.0 on the connected phone.

Renamed the primary icon resource to `PixelSun` and incremented both app and widget
build numbers to 2 to distinguish the update and address a possible cached icon.
This is a cache mitigation, not a confirmed diagnosis. Device build log:
`/tmp/eightbit-pixelsun-build.log`.

Build 2 passed the physical-device build and strict signature verification.
CoreDevice confirmed installation; compiled Info.plist selects `PixelSun`.
Home Screen appearance still requires user confirmation.

## Build 3: stronger material after screenshot review

The user-supplied Home Screen crop shows the new gradient and raised pixel edges.
This confirms the new artwork was displayed; it does not establish whether caching
affected build 1. Increased material translucency and reduced the heavy shadows
while preserving the opaque facial artwork. Physical-device build and strict
signature verification passed. Inspected the compiled small icon; native image
stacks remain present. Composer UI inspection was unavailable because the Mac
was locked. Full wallpaper transparency requires the user-selected Clear Home
Screen appearance. Build log: `/tmp/eightbit-pixelsun-build3.log`.

CoreDevice confirmed build 3 installed on the iPhone. Both app and widget use
build number 3, and the primary icon is `PixelSun`.
