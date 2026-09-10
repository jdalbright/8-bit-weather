import { describe, expect, it } from 'vitest';
import { asheville, tokyo } from '../test/fixtures';
import { landscapeForPlace, landscapes, landscapeSource } from './landscapes';
import type { Landscape } from './landscapes';
import { distanceToOceanKm, distanceToSegmentKm, ncRegion, pointInRings } from './geography';

const places: [string, number, number, Landscape][] = [
  ['Raleigh', 35.7796, -78.6382, 'raleigh'], ['Cary', 35.7915, -78.7811, 'raleigh'],
  ['Wilmington', 34.2257, -77.9447, 'beach'], ['Wrightsville Beach', 34.2085, -77.7964, 'beach'],
  ['Nags Head', 35.9574, -75.6241, 'beach'], ['Ocracoke', 35.1146, -75.981, 'beach'],
  ['Greenville', 35.6127, -77.3664, 'coastal-plain'], ['New Bern', 35.1085, -77.0441, 'coastal-plain'],
  ['Durham', 35.994, -78.8986, 'piedmont'], ['Greensboro', 36.0726, -79.792, 'piedmont'],
  ['Charlotte', 35.2271, -80.8431, 'piedmont'], ['Asheville', 35.5951, -82.5515, 'blue-ridge'],
  ['Boone', 36.2168, -81.6746, 'blue-ridge'],
  ['Knoxville', 35.9606, -83.9207, 'meadow'], ['Myrtle Beach', 33.6891, -78.8867, 'meadow'],
  ['Norfolk', 36.8508, -76.2859, 'meadow'], ['Greenville SC', 34.8526, -82.394, 'meadow'],
];

describe('offline local landscape selection', () => {
  it.each(places)('%s selects its regional scene with city search and GPS', (name, latitude, longitude, expected) => {
    const place = { ...asheville, name, latitude, longitude };
    expect(landscapeForPlace(place)).toBe(expected);
    expect(landscapeForPlace({ ...place, name: 'Current location', region: undefined, country: undefined, source: 'gps' })).toBe(expected);
  });
  it('preserves the original Raleigh radius', () => {
    const place = { ...asheville, longitude: -78.6382 };
    expect(landscapeForPlace({ ...place, latitude: 35.7796 + 24.99 / 111.2 })).toBe('raleigh');
    expect(landscapeForPlace({ ...place, latitude: 35.7796 + 25.01 / 111.2 })).toBe('piedmont');
  });
  it('uses the 20 km oceanfront cutoff, not distance to an inland river', () => {
    const near = { ...asheville, latitude: 34.23, longitude: -78.02 };
    const inland = { ...near, longitude: -78.06 };
    expect(distanceToOceanKm(near.latitude, near.longitude)).toBeLessThan(20);
    expect(distanceToOceanKm(inland.latitude, inland.longitude)).toBeGreaterThan(20);
    expect(landscapeForPlace(near)).toBe('beach');
    expect(landscapeForPlace(inland)).toBe('coastal-plain');
    expect(distanceToOceanKm(35.1085, -77.0441)).toBeGreaterThan(40);
  });
  it('does not infer geography from city or region labels', () => {
    expect(landscapeForPlace({ ...tokyo, name: 'Raleigh', region: 'North Carolina' })).toBe('meadow');
    expect(landscapeForPlace({ ...asheville, name: 'Beach' })).toBe('blue-ridge');
  });
  it('keeps first use and unusable coordinates on the original artwork', () => {
    expect(landscapeForPlace(null)).toBe('meadow');
    for (const latitude of [NaN, Infinity, -Infinity, 91, -91]) expect(landscapeForPlace({ ...asheville, latitude })).toBe('meadow');
    for (const longitude of [NaN, Infinity, -Infinity, 181, -181]) expect(landscapeForPlace({ ...asheville, longitude })).toBe('meadow');
  });
  it('has all three asset variants for each registered landscape', () => {
    for (const landscape of Object.keys(landscapes) as Landscape[]) {
      const sources = ['day', 'overcast', 'night'].map(light => landscapeSource(landscape, light as 'day' | 'overcast' | 'night'));
      expect(new Set(sources).size).toBe(3);
      expect(sources.every(source => source.startsWith('/art/') && source.endsWith('.webp'))).toBe(true);
    }
    expect(landscapeSource('meadow', 'day')).toBe('/art/scene-day-v2.webp');
    expect(landscapeSource('raleigh', 'night')).toBe('/art/scene-raleigh-night-v1.webp');
  });
});

describe('geographic boundaries', () => {
  it('keeps nearby places on opposite sides of regional transitions distinct', () => {
    expect(ncRegion(35.7332, -81.3412)).toBe('piedmont'); // Hickory
    expect(ncRegion(35.684, -82.009)).toBe('piedmont'); // Marion foothills
    expect(ncRegion(35.6179, -82.3212)).toBe('blue-ridge'); // Black Mountain
    expect(ncRegion(35.9132, -79.0558)).toBe('piedmont'); // Chapel Hill
    expect(ncRegion(35.3849, -78.0198)).toBe('coastal-plain'); // Goldsboro
  });
  it('includes boundary points, excludes holes, and retains disconnected islands', () => {
    const outer = [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]];
    const hole = [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]];
    const island = [[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]];
    expect(pointInRings(2, 0, [outer, hole])).toBe(true);
    expect(pointInRings(.5, .5, [outer, hole])).toBe(true);
    expect(pointInRings(2, 2, [outer, hole])).toBe(false);
    expect(pointInRings(5.5, 5.5, [outer, hole, island])).toBe(true);
    expect(pointInRings(7, 7, [outer, hole, island])).toBe(false);
  });
  it('measures perpendicular distance and handles endpoints and collapsed segments', () => {
    expect(distanceToSegmentKm(0, 0, [-1, 1], [1, 1])).toBeCloseTo(111.2);
    expect(distanceToSegmentKm(0, 2, [-1, 0], [1, 0])).toBeCloseTo(111.2);
    expect(distanceToSegmentKm(0, 0, [0, 1], [0, 1])).toBeCloseTo(111.2);
  });
});
