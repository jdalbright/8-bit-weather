import geography from '../data/nc-geography.json' with { type: 'json' };

type Point = readonly number[];
type Ring = readonly Point[];
export type NCRegion = keyof typeof geography.regions;

/** Distance in a local kilometre plane; suitable for this small regional map. */
export function distanceToSegmentKm(latitude: number, longitude: number, a: Point, b: Point): number {
  const east = 111.2 * Math.cos(latitude * Math.PI / 180);
  const ax = (a[0] - longitude) * east, ay = (a[1] - latitude) * 111.2;
  const bx = (b[0] - longitude) * east, by = (b[1] - latitude) * 111.2;
  const dx = bx - ax, dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function bounds(ring: Ring) {
  return ring.reduce((box, [x, y]) => [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)],
    [Infinity, Infinity, -Infinity, -Infinity]);
}
const regions = (['blue-ridge', 'piedmont', 'coastal-plain'] as const).map(name => ({
  name, rings: geography.regions[name].map(points => ({ points, box: bounds(points) })),
}));

// Odd-even containment handles disjoint islands and holes without relying on
// ArcGIS ring winding. Shared boundary points use the stable region order above.
export function pointInRings(latitude: number, longitude: number, rings: readonly Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if (distanceToSegmentKm(latitude, longitude, a, b) < 1e-7) return true;
      if ((a[1] > latitude) !== (b[1] > latitude)
        && longitude < (b[0] - a[0]) * (latitude - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}

export function ncRegion(latitude: number, longitude: number): NCRegion | null {
  for (const region of regions) {
    const rings = region.rings.filter(({ box }) => longitude >= box[0] && latitude >= box[1] && longitude <= box[2] && latitude <= box[3]);
    if (pointInRings(latitude, longitude, rings.map(ring => ring.points))) return region.name;
  }
  return null;
}

export function distanceToOceanKm(latitude: number, longitude: number): number {
  let distance = Infinity;
  for (const line of geography.coastline) {
    for (let i = 1; i < line.length; i++) distance = Math.min(distance, distanceToSegmentKm(latitude, longitude, line[i - 1], line[i]));
  }
  return distance;
}
