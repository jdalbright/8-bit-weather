import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { asheville, fixtureTime, forecastFixture } from './test/fixtures';
import { normalizeWeather, STALE_AFTER } from './lib/weather';
import { defaultPreferences, saveState } from './lib/storage';
import type { Place, WeatherSnapshot } from './types';

const mocks = vi.hoisted(() => ({ weather: {} as { snapshot: WeatherSnapshot | null; now: number; online: boolean; loading: boolean; error: string | null; refresh: () => Promise<void> }, widget: vi.fn(async () => {}), briefing: vi.fn(), locate: vi.fn() }));
vi.mock('./hooks/useWeather', () => ({ useWeather: () => mocks.weather }));
vi.mock('./lib/widget', () => ({ syncWidget: mocks.widget }));
vi.mock('./lib/api', async importOriginal => ({ ...await importOriginal<object>(), locate: mocks.locate }));
vi.mock('./components/WeatherBriefing', () => ({ WeatherBriefing: (props: unknown) => { mocks.briefing(props); return <div>Current briefing</div>; } }));
vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }) }));

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(fixtureTime + 1800000); vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
  const raw = forecastFixture();
  raw.hourly.weather_code[1] = 65; raw.hourly.temperature_2m[1] = 10;
  raw.hourly.precipitation_probability[1] = 5; raw.hourly.precipitation_probability[2] = 85;
  mocks.weather = { snapshot: normalizeWeather(raw, asheville, fixtureTime), now: fixtureTime + 1800000, online: true, loading: false, error: null, refresh: vi.fn(async () => {}) };
  saveState({ preferences: defaultPreferences('en-US'), places: [asheville], selected: asheville });
});
const slider = () => screen.getByRole('slider', { name: 'Forecast preview time' });
const select = (value = '1') => fireEvent.change(slider(), { target: { value } });

it('synchronizes slider, tiles, preview readout and current sections without altering briefing or widget data', () => {
  const { container } = render(<App/>);
  const stats = container.querySelector('.current-stats')!.textContent;
  const before = structuredClone(mocks.weather.snapshot);
  const widgetCalls = mocks.widget.mock.calls.length;
  select();
  expect(screen.getByText('Forecast preview', { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: '50° Fahrenheit' })).toBeInTheDocument();
  expect(container.querySelector('.scenery')).toHaveAttribute('data-scene', 'rain-day');
  expect(container.querySelector('.feels-like')).toHaveTextContent('85%');
  expect(container.querySelector('.hour[aria-pressed="true"]')).toHaveTextContent('11 AM');
  expect(container.querySelector('.current-stats')!.textContent).toBe(stats);
  expect(screen.getByRole('heading', { name: 'Current conditions' })).toBeInTheDocument();
  expect(mocks.weather.snapshot).toEqual(before);
  expect(mocks.briefing).toHaveBeenLastCalledWith(expect.objectContaining({ snapshot: mocks.weather.snapshot, now: mocks.weather.now }));
  expect(mocks.widget).toHaveBeenCalledTimes(widgetCalls);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  fireEvent.click(container.querySelectorAll('.hour')[3]);
  expect(slider()).toHaveValue('3');
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Back to now' }));
  expect(slider()).toHaveValue('0'); expect(slider()).toHaveFocus();
  expect(screen.getByRole('heading', { name: '72° Fahrenheit' })).toBeInTheDocument();
  expect(container.querySelector('.forecast-preview-badge')).not.toBeInTheDocument();
});

it('keeps timestamps across refresh, resets removed hours, and does not resurrect selection when data returns', () => {
  const { rerender } = render(<App/>); select('2');
  const saved = mocks.weather.snapshot!;
  mocks.weather = { ...mocks.weather, snapshot: { ...saved, fetchedAt: fixtureTime + 1800000 } };
  rerender(<App/>); expect(slider()).toHaveValue('2');
  mocks.weather = { ...mocks.weather, snapshot: { ...saved, hourly: saved.hourly.filter((_, i) => i !== 2) } };
  rerender(<App/>); expect(slider()).toHaveValue('0');
  mocks.weather = { ...mocks.weather, snapshot: saved };
  rerender(<App/>); expect(slider()).toHaveValue('0');
  select('1'); mocks.weather.now = saved.hourly[1].time * 1000;
  rerender(<App/>); expect(slider()).toHaveValue('0');
});

it('labels offline and stale previews and hides controls after all future hours expire', () => {
  const { rerender } = render(<App/>); select();
  mocks.weather.online = false; rerender(<App/>);
  expect(screen.getByText('Saved forecast preview')).toBeInTheDocument();
  expect(screen.getByText(/Saved forecast ·/)).toHaveTextContent('10:00 AM');
  mocks.weather.online = true; mocks.weather.now = fixtureTime + STALE_AFTER;
  rerender(<App/>); expect(screen.getByText('Saved forecast preview')).toBeInTheDocument();
  mocks.weather.now = fixtureTime + 3 * 86400000;
  rerender(<App/>); expect(screen.queryByRole('slider', { name: 'Forecast preview time' })).not.toBeInTheDocument();
});

it('clears preview when leaving Today and on reload', () => {
  const { unmount } = render(<App/>); select();
  const nav = within(screen.getByRole('navigation'));
  fireEvent.click(nav.getByRole('button', { name: 'Settings' }));
  fireEvent.click(nav.getByRole('button', { name: 'Today' }));
  expect(slider()).toHaveValue('0');
  select(); unmount(); render(<App/>);
  expect(slider()).toHaveValue('0');
});

it('resets preview when GPS keeps its ID but changes coordinates', async () => {
  const place: Place = { ...asheville, id: 'current-location', name: 'Current location', source: 'gps' };
  mocks.weather.snapshot = { ...mocks.weather.snapshot!, placeId: place.id };
  saveState({ preferences: defaultPreferences('en-US'), places: [], selected: place });
  mocks.locate.mockResolvedValue({ ...place, latitude: 36 });
  const { rerender } = render(<App/>); select();
  fireEvent.click(screen.getByRole('button', { name: 'Change location, Current location' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Use my location' })));
  mocks.weather.snapshot = { ...mocks.weather.snapshot!, latitude: 36 };
  rerender(<App/>); expect(slider()).toHaveValue('0');
});
