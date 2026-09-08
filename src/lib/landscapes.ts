import type { Place } from '../types';

export type Landscape = 'meadow' | 'raleigh';
export type LandscapeLight = 'day' | 'overcast' | 'night';

/** A local illustration, selected by coordinates so GPS and city search agree. */
export function landscapeForPlace(place: Place | null): Landscape {
  if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return 'meadow';
  const northKm = (place.latitude - 35.7796) * 111.2;
  const eastKm = (place.longitude + 78.6382) * 111.2 * Math.cos(35.7796 * Math.PI / 180);
  return Math.hypot(northKm, eastKm) <= 25 ? 'raleigh' : 'meadow';
}

export function landscapeSource(landscape: Landscape, light: LandscapeLight): string {
  return landscape === 'raleigh' ? `/art/scene-raleigh-${light}-v1.webp` : `/art/scene-${light}-v2.webp`;
}
