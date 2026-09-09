"""Build the app's readable 5 overlays. Run after npm ci with fontTools installed.

These modified Pixelify Sans subsets are licensed under the SIL Open Font
License 1.1; see docs/licenses/pixelify-sans.txt. Only U+0035 is included.
Keep the upstream advance width and vertical metrics so the overlay does not
change text layout. The full-width top bar and straight upper-left stem make
the numeral distinct from S at small forecast sizes.
"""

from pathlib import Path

from fontTools import subset
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUTLINES = {
    400: [
        (60, 631), (525, 631), (525, 530), (161, 530), (161, 359),
        (433, 359), (433, 270), (525, 270), (525, 78), (433, 78),
        (433, -12), (151, -12), (151, 78), (60, 78), (60, 179),
        (161, 179), (161, 88), (423, 88), (423, 260), (60, 260),
    ],
    600: [
        (61, 636), (536, 636), (536, 511), (179, 511), (179, 374),
        (446, 374), (446, 288), (536, 288), (536, 75), (446, 75),
        (446, -11), (150, -11), (150, 75), (61, 75), (61, 200),
        (179, 200), (179, 113), (417, 113), (417, 251), (61, 251),
    ],
}


def build(weight: int) -> None:
    source = ROOT / f"node_modules/@fontsource/pixelify-sans/files/pixelify-sans-latin-{weight}-normal.woff"
    font = TTFont(source, recalcTimestamp=False)
    pen = TTGlyphPen(None)
    points = OUTLINES[weight]
    pen.moveTo(points[0])
    for point in points[1:]:
        pen.lineTo(point)
    pen.closePath()
    font["glyf"]["five"] = pen.glyph()

    options = subset.Options()
    options.name_IDs = ["*"]  # Preserve the upstream copyright and OFL metadata.
    options.name_legacy = True
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=[0x35])
    subsetter.subset(font)

    style = "Regular" if weight == 400 else "SemiBold"
    names = {
        1: "Weather Five", 2: style, 3: f"WeatherFive-{style}-1.0",
        4: f"Weather Five {style}", 6: f"WeatherFive-{style}",
        16: "Weather Five", 17: style,
    }
    font["name"].names = [record for record in font["name"].names if record.nameID not in names]
    for name_id, value in names.items():
        font["name"].setName(value, name_id, 3, 1, 0x409)
    output = ROOT / f"src/fonts/weather-five-{weight}.woff"
    output.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff"
    font.save(output)
    print(f"{output.relative_to(ROOT)}: {output.stat().st_size} bytes")


if __name__ == "__main__":
    for weight in OUTLINES:
        build(weight)
