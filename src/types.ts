export type Units = 'imperial' | 'metric';
export type View = 'today' | 'radar' | 'places' | 'settings';
export type WeatherKind = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm' | 'unknown';
export type LightingPhase = 'dawn' | 'day' | 'dusk' | 'night';
export type Discovery = 'river' | 'station';
export type SceneState = {
  kind: WeatherKind; isDay: boolean; wind: number;
  phase: LightingPhase;
  /** Progress through a dawn/dusk window, from 0 to 1. */
  transition: number;
  daylight: number;
  windStrength: number;
  precipitationIntensity: number;
};

export interface Place {
  id: string;
  name: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  source: 'search' | 'gps';
}

export interface CurrentWeather {
  time: number;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  wind: number | null;
  code: number | null;
  isDay: boolean;
  uv?: number | null;
}
export interface HourWeather {
  time: number;
  temperature: number | null;
  precipitation: number | null;
  code: number | null;
  isDay: boolean;
  uv?: number | null;
  wind?: number | null;
}
export interface DayWeather {
  date: string;
  time: number;
  high: number | null;
  low: number | null;
  precipitation: number | null;
  code: number | null;
  sunrise: number | null;
  sunset: number | null;
  uvMax?: number | null;
}
export interface RainWeather {
  /** End of the preceding 15-minute interval, in Unix seconds. */
  time: number;
  /** Rain plus convective showers, in millimeters; excludes snow. */
  amount: number | null;
}
export interface WeatherSnapshot {
  version: 1;
  placeId: string;
  latitude: number;
  longitude: number;
  timezone: string;
  fetchedAt: number;
  current: CurrentWeather;
  hourly: HourWeather[];
  daily: DayWeather[];
  /** Optional so forecasts saved before the rain outlook remain usable. */
  minutely?: RainWeather[];
}
export type BriefingProvider = 'openai' | 'apple';
export interface Preferences {
  haptics: boolean;
  briefingProvider: BriefingProvider;
  units: Units;
  music: boolean;
  ambience: boolean;
  effects: boolean;
  musicVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  reducedMotion: boolean;
}
