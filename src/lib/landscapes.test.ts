import { describe, expect, it } from 'vitest';
import { asheville, tokyo } from '../test/fixtures';
import { landscapeForPlace } from './landscapes';

describe('local landscape selection', () => {
  it('uses the Raleigh illustration for nearby city and GPS locations', () => {
    const raleigh = { ...asheville, name: 'Raleigh', latitude: 35.7796, longitude: -78.6382 };
    expect(landscapeForPlace(raleigh)).toBe('raleigh');
    expect(landscapeForPlace({ ...raleigh, name: 'Current location', source: 'gps' })).toBe('raleigh');
    expect(landscapeForPlace({ ...raleigh, name: 'Cary', latitude: 35.7915, longitude: -78.7811 })).toBe('raleigh');
  });
  it('keeps the meadow outside the Raleigh area, even for a city with the same name', () => {
    expect(landscapeForPlace(asheville)).toBe('meadow');
    expect(landscapeForPlace(tokyo)).toBe('meadow');
    expect(landscapeForPlace({ ...asheville, name: 'Raleigh' })).toBe('meadow');
    expect(landscapeForPlace({ ...asheville, name: 'Durham', latitude: 35.994, longitude: -78.8986 })).toBe('meadow');
  });
  it('keeps first use and unavailable coordinates on the original artwork', () => {
    expect(landscapeForPlace(null)).toBe('meadow');
    expect(landscapeForPlace({ ...asheville, latitude: NaN })).toBe('meadow');
  });
});
