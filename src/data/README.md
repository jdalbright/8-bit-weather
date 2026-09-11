# Bundled geography and map styles

## Radar basemap

`radar-map-style.json` is a customized derivative of [OpenFreeMap Positron](https://tiles.openfreemap.org/styles/positron), retrieved September 11, 2026. It changes land, vegetation, water, road and label colors to the app theme, removes railway/POI/sprite layers, and retains geographic labels. Attribution and full upstream notices are bundled in `public/radar/credits.html` and the adjacent license files. Positron's code is BSD 3-Clause and its design is CC BY 4.0, derived from CartoDB Basemaps designed by Stamen and Paul Norman (CC BY 3.0). See [the radar documentation](../../docs/radar.md) for services, legends and limits.

## Offline North Carolina illustration map

`nc-geography.json` contains WGS84 `[longitude, latitude]` rings and oceanfront polylines downloaded September 9, 2026. It has no place-name rules and requires no browser-side GIS request.

## Sources

- **Regions:** [NC Geological Survey, Physiography of NC](https://services2.arcgis.com/kCu40SDxsCGcuUWO/ArcGIS/rest/services/Physiography_of_NC/FeatureServer/0). The three `Physiograp` values provide Blue Ridge, Piedmont, and Coastal Plain polygons, including the state outline and coastal islands.
- **Ocean:** [NC DEQ Division of Coastal Management, Shorelines — Oceanfront & Inlet](https://services2.arcgis.com/kCu40SDxsCGcuUWO/arcgis/rest/services/NC_Division_of_Coastal_Management_Map_Viewer_WFL1_20251007/FeatureServer/16), reached through the [state's coastal maps and data page](https://www.deq.nc.gov/about/divisions/division-coastal-management/interactive-maps-data). The bundled statewide 2016 survey filters `FEATURE = 'Oceanfront Shoreline' AND SHR_YEAR = 2016`, yielding 54 paths. It does not use estuarine shorelines, inlet shorelines, erosion transects, or construction setback polygons.

Attribution: NC Geological Survey and NC DEQ Division of Coastal Management. The bundled derivative is for choosing an illustrative backdrop, not navigation, property boundaries, coastal hazards, or regulatory use.

## Reproduction and limits

Run `python3 scripts/build-nc-geography.py` deliberately when refreshing the data. The ordinary application build never downloads GIS data. The script requests WGS84 output, a 0.001-degree generalization tolerance, and four decimal places, preserves multipart rings, paginates responses, and checks that the shoreline spans the NC coast. Current derivative size: 263,460 bytes before bundling/compression.

Regional boundaries are generalized and the 2016 shoreline is a historical snapshot. This is appropriate for regional artwork; neither it nor the 20 km beach band is an exact site classification. Coastline changes, coordinate rounding, and simplification can affect locations close to a boundary. The distance calculation uses a local kilometre plane at the selected latitude.

Selection order: validate coordinates; preserve Raleigh's 25 km radius; find the NC region; for Coastal Plain locations within 20 km of the oceanfront use Beach; otherwise use the region. Outside the NC polygons, use Meadow. Shared province boundary points use the stable Blue Ridge, Piedmont, Coastal Plain order. GPS and search follow the same logic, with no persistent preference or data migration.
