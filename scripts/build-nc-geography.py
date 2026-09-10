"""Refresh the small, offline NC illustration map from public NC DEQ services.

Run deliberately with python3 scripts/build-nc-geography.py, never during build.
Coordinates are WGS84 [longitude, latitude]. This is not navigation data.
"""
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
REGIONS = 'https://services2.arcgis.com/kCu40SDxsCGcuUWO/ArcGIS/rest/services/Physiography_of_NC/FeatureServer/0'
SHORE = 'https://services2.arcgis.com/kCu40SDxsCGcuUWO/arcgis/rest/services/NC_Division_of_Coastal_Management_Map_Viewer_WFL1_20251007/FeatureServer/16'


def features(service, where, fields):
    offset = 0
    result = []
    while True:
        params = dict(f='json', where=where, outFields=fields, outSR=4326,
                      maxAllowableOffset=0.001, geometryPrecision=4,
                      resultOffset=offset, resultRecordCount=1000)
        with urlopen(service + '/query?' + urlencode(params), timeout=60) as response:
            data = json.load(response)
        if 'error' in data:
            raise RuntimeError(data['error'])
        page = data['features']
        result.extend(page)
        if not data.get('exceededTransferLimit'):
            return result
        if not page:
            raise RuntimeError('Incomplete GIS pagination')
        offset += len(page)


if __name__ == '__main__':
    names = {'Blue Ridge': 'blue-ridge', 'Piedmont': 'piedmont', 'Coastal Plain': 'coastal-plain'}
    provinces = features(REGIONS, '1=1', 'Physiograp')
    regions = {names[f['attributes']['Physiograp']]: f['geometry']['rings'] for f in provinces}
    assert set(regions) == set(names.values())
    # A statewide survey, rather than mixing local surveys from different years.
    coast = features(SHORE, "FEATURE = 'Oceanfront Shoreline' AND SHR_YEAR = 2016", 'SHR_YEAR,FEATURE')
    lines = [path for f in coast for path in f['geometry']['paths'] if len(path) > 1]
    assert lines, 'No oceanfront shoreline returned'
    points = [point for line in lines for point in line]
    assert min(p[0] for p in points) < -78.4 and max(p[1] for p in points) > 36.5, 'Incomplete coastline'
    data = {'regions': regions, 'coastline': lines}
    output = ROOT / 'src/data/nc-geography.json'
    output.write_text(json.dumps(data, separators=(',', ':')) + '\n')
    print(f'{output.name}: {output.stat().st_size:,} bytes; {len(lines)} shoreline paths')
