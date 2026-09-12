import type { Place } from '../types';
import { ncRegion, distanceToOceanKm } from './geography';
import { creek, ocean, raleighCreek, slowRiver, woodlandCreek } from './water-layouts';
import type { WaterLayout } from './water-layouts';

export type Landscape = 'meadow' | 'raleigh' | 'beach' | 'coastal-plain' | 'piedmont' | 'blue-ridge';
export type LandscapeLight = 'day' | 'overcast' | 'night';

type LandscapeDefinition = {
  name: string;
  artPrefix: string;
  artVersion: number;
  water: WaterLayout;
  vegetation: { kind: 'grass' | 'reeds' | 'sea-oats'; positions: number[][]; colors: [string, string] };
  birds: { kind: 'songbird' | 'gull'; positions: number[][] };
  fireflies: number[][];
};
const grass: LandscapeDefinition['vegetation'] = {
  kind: 'grass', positions: [[67, 778], [121, 755], [314, 781], [359, 729], [401, 765], [875, 703], [913, 755]], colors: ['#315b3c', '#789747'],
};
const birds: LandscapeDefinition['birds'] = { kind: 'songbird', positions: [[380, 576], [484, 552]] };
const fireflies = [[115, 664], [327, 699], [413, 661], [491, 709], [558, 639], [718, 662], [840, 689], [892, 621]];

export const landscapes: Record<Landscape, LandscapeDefinition> = {
  meadow: { name: 'Meadow', artPrefix: 'scene', artVersion: 2, water: creek, vegetation: grass, birds, fireflies },
  raleigh: { name: 'Raleigh', artPrefix: 'scene-raleigh', artVersion: 1, water: raleighCreek, vegetation: grass, birds, fireflies },
  beach: {
    name: 'Beach', artPrefix: 'scene-beach', artVersion: 1, water: ocean,
    vegetation: { kind: 'sea-oats', positions: [[52, 706], [139, 762], [311, 771], [456, 760]], colors: ['#667944', '#c1a250'] },
    birds: { kind: 'gull', positions: [[471, 480], [635, 506]] }, fireflies: [],
  },
  'coastal-plain': {
    name: 'Coastal Plain', artPrefix: 'scene-coastal-plain', artVersion: 1, water: slowRiver,
    vegetation: { kind: 'reeds', positions: [[98, 761], [351, 676], [481, 706], [614, 788], [900, 643]], colors: ['#42643b', '#b6ad68'] },
    birds: { kind: 'songbird', positions: [[425, 570], [594, 546]] },
    fireflies: [[126, 659], [312, 666], [446, 644], [524, 667], [669, 767], [844, 622]],
  },
  piedmont: { name: 'Piedmont', artPrefix: 'scene-piedmont', artVersion: 1, water: woodlandCreek, vegetation: grass, birds, fireflies },
  'blue-ridge': {
    name: 'Blue Ridge', artPrefix: 'scene-blue-ridge', artVersion: 1, water: { ...woodlandCreek, duration: 3.8 },
    vegetation: { ...grass, colors: ['#315b43', '#749946'] }, birds,
    fireflies: [[115, 664], [327, 699], [413, 661], [491, 709], [840, 689]],
  },
};

/** A local illustration, selected by coordinates so GPS and city search agree. */
export function landscapeForPlace(place: Place | null): Landscape {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)
    || Math.abs(place.latitude) > 90 || Math.abs(place.longitude) > 180) return 'meadow';
  const northKm = (place.latitude - 35.7796) * 111.2;
  const eastKm = (place.longitude + 78.6382) * 111.2 * Math.cos(35.7796 * Math.PI / 180);
  if (Math.hypot(northKm, eastKm) <= 25) return 'raleigh';
  const region = ncRegion(place.latitude, place.longitude);
  if (!region) return 'meadow';
  if (region === 'coastal-plain' && distanceToOceanKm(place.latitude, place.longitude) <= 20) return 'beach';
  return region;
}

export function landscapeSource(landscape: Landscape, light: LandscapeLight): string {
  const definition = landscapes[landscape];
  return `/art/${definition.artPrefix}-${light}-v${definition.artVersion}.webp`;
}
