import type { HourWeather, SceneState, WeatherSnapshot } from '../types';
import { currentWeatherCode, localDate, STALE_AFTER, weatherInfo } from './weather';

const HALF_TWILIGHT = 30 * 60;
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const welcomeScene: SceneState = {
  kind: 'clear', isDay: true, wind: 0, phase: 'day', transition: 0,
  daylight: 1, windStrength: 0, precipitationIntensity: 0,
};

/** Illustration strength from WMO codes, never a precipitation measurement. */
export function precipitationIntensity(code: number | null): number {
  if (code === null) return 0;
  if ([51, 56, 61, 66, 71, 77, 80, 85].includes(code)) return .35;
  if ([53, 63, 73, 81, 95].includes(code)) return .65;
  if ([55, 57, 65, 67, 75, 82, 86, 96, 99].includes(code)) return 1;
  return 0;
}

export function deriveScene(snapshot: WeatherSnapshot | null, now: number, online = true): SceneState {
  if (!snapshot) return welcomeScene;
  const { current } = snapshot;
  const stale = !online || now < snapshot.fetchedAt || now - snapshot.fetchedAt >= STALE_AFTER
    || now - current.time * 1000 > 3600000;
  // Saved weather keeps the light of its observation, rather than inventing a current scene.
  const time = stale ? current.time : now / 1000;
  return sceneAt(snapshot, time, { ...current, code: currentWeatherCode(current) });
}

/** Forecast time is intentional: saved snapshots must not freeze this at observation time. */
export function deriveHourlyScene(snapshot: WeatherSnapshot, hour: HourWeather): SceneState {
  return sceneAt(snapshot, hour.time, hour);
}

function sceneAt(snapshot: WeatherSnapshot, time: number, conditions: Pick<HourWeather, 'code' | 'isDay' | 'wind'>): SceneState {
  const date = localDate(time * 1000, snapshot.timezone);
  const day = snapshot.daily.find(day => day.date === date);
  let phase: SceneState['phase'] = conditions.isDay ? 'day' : 'night';
  let daylight = conditions.isDay ? 1 : 0;
  let transition = 0;
  const sunrise = day?.sunrise, sunset = day?.sunset;
  // Polar days/nights, absent solar data, and overlapping twilight windows use is_day.
  if (sunrise != null && sunset != null && Number.isFinite(sunrise) && Number.isFinite(sunset)
    && sunset - sunrise >= HALF_TWILIGHT * 2
    && localDate(sunrise * 1000, snapshot.timezone) === date
    && localDate(sunset * 1000, snapshot.timezone) === date) {
    if (time >= sunrise - HALF_TWILIGHT && time < sunrise + HALF_TWILIGHT) {
      phase = 'dawn'; transition = clamp((time - sunrise + HALF_TWILIGHT) / (HALF_TWILIGHT * 2)); daylight = transition;
    } else if (time >= sunset - HALF_TWILIGHT && time < sunset + HALF_TWILIGHT) {
      phase = 'dusk'; transition = clamp((time - sunset + HALF_TWILIGHT) / (HALF_TWILIGHT * 2)); daylight = 1 - transition;
    } else {
      daylight = time >= sunrise && time < sunset ? 1 : 0; phase = daylight ? 'day' : 'night';
    }
  }
  const wind = conditions.wind != null && Number.isFinite(conditions.wind) ? Math.max(0, conditions.wind) : 0;
  return {
    kind: weatherInfo(conditions.code).kind, isDay: daylight >= .5, wind, phase, transition, daylight,
    windStrength: clamp(wind / 40), precipitationIntensity: precipitationIntensity(conditions.code),
  };
}

// Every visual and hotspot shares this grid. The day plate's one-pixel height difference
// is registered to this common frame; no independently positioned screen overlays.
export const ART = { width: 960, height: 801 };
export const anchors = { rotor: { x: 195, y: 511 }, station: { x: 229, y: 579 }, river: { x: 701, y: 744 } };
export function sceneGeometry(width: number, height: number) {
  const scale = Math.max(width / ART.width, height / ART.height);
  return { scale, left: (width - ART.width * scale) / 2, top: height - ART.height * scale };
}
