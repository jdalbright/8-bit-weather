import { registerPlugin } from '@capacitor/core';
import type { Place, Units, WeatherSnapshot } from '../types';
import { landscapeForPlace } from './landscapes';
import { isNativeApp } from './native';
import { currentWeatherCode } from './weather';

const WeatherWidget = registerPlugin<{ update(options: { payload: string }): Promise<void>; clear(): Promise<void> }>('WeatherWidget');
let pending: Promise<void> = Promise.resolve();
export function widgetPayload(place: Place, units: Units, weather: WeatherSnapshot | null) {
  const resolved = weather ? { ...weather, current: { ...weather.current, code: currentWeatherCode(weather.current) } } : null;
  return { version: 1, place, units, weather: resolved, landscape: landscapeForPlace(place), updatedAt: Date.now() };
}
/** Ordered updates prevent an old location write winning over a new selection or clear. */
export function syncWidget(place: Place | null, units: Units, weather: WeatherSnapshot | null): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  const payload = place ? JSON.stringify(widgetPayload(place, units, weather)) : null;
  pending = pending.catch(() => {}).then(() => payload ? WeatherWidget.update({ payload }) : WeatherWidget.clear());
  return pending;
}
