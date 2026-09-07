export type Units = 'imperial' | 'metric';
export type View = 'today' | 'places' | 'settings';
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
}
export interface HourWeather {
  time: number;
  temperature: number | null;
  precipitation: number | null;
  code: number | null;
  isDay: boolean;
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
}
export interface Preferences {
  units: Units;
  music: boolean;
  ambience: boolean;
  effects: boolean;
  musicVolume: number;
  ambienceVolume: number;
  effectsVolume: number;
  reducedMotion: boolean;
}
