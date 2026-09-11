# Raleigh wildlife

The first wildlife pass retained the Raleigh painting and water. The oak canopies
have since become [separate animated sprites](../raleigh-oaks-v1/README.md).
The ambient bird and leaf layers use the free [Garden Birds pack by Pop Shop
Packs](https://pop-shop-packs.itch.io/garden-birds-pixel-character-asset-pack)
and [Windy Leaves by EdgeLoopRepeat](https://rs-pixel-store.itch.io/falling-leaf-fx).
Their published permissions are retained in
[`credits.txt`](../../../public/art/raleigh-wildlife/credits.txt), which is also
available offline in the app. Credit links appear in the Settings footer.

## Original sheets

| Runtime file | Original file | Layout |
| --- | --- | --- |
| `cardinal.png` | `Spritesheets/spritesheet_cardinal.png` | 64×64; 16×16 cells; row 0 has four flying frames; row 1, column 0 is standing |
| `blue-jay.png` | `Spritesheets/spritesheet_blue jay.png` | Same bird layout |
| `leaves.png` | `ELR-WindyLeafs/ELR_SpringlLeaf.png` | 80×16; five 16×16 fluttering frames |

All three PNGs are byte-for-byte copies of the downloaded source images.
Frame clipping, facing direction, scaling, and scene lighting are handled by
CSS. Do not upload the bird artwork to an image generator. Full downloaded
archives and unrelated species are not part of the repository or app bundle.

## Scene behavior

Birds fly for six seconds, alternating cardinal and blue jay on a 40-second
cycle with a 20-second offset. The first cardinal arrives after two seconds.
Flights stay beneath the weather text along the lower treeline. Birds appear
only during daytime clear, partly cloudy, and cloudy conditions.

Six staggered leaf paths start near the oaks. Drift takes 18–20 seconds in calm
weather and 9–11 seconds at maximum illustrated wind strength. The five sprite
frames loop independently of translation. Leaves dim at night and are absent
in snow or unknown weather. Paths are decorative; they do not claim to depict
observed wind direction.

The existing scene pause signal stops both sprite frames and travel. When
decoration is paused, eligible birds use one stationary cardinal pose and
leaves disappear. CSS handles all motion without frame timers or React updates.
Other regional scenery retains its existing bird and vegetation behavior.
