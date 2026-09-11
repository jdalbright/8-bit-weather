import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { defaultPreferences, saveState, cacheWeather } from './lib/storage';
import { normalizeWeather } from './lib/weather';
import { asheville, fixtureTime, forecastFixture } from './test/fixtures';

vi.mock('virtual:pwa-register/react', () => ({ useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }) }));
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(fixtureTime + 30 * 60000);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  saveState({ preferences: defaultPreferences('en-US'), places: [asheville], selected: asheville });
  const raw = forecastFixture(fixtureTime, 95);
  raw.hourly.precipitation_probability[0] = 10;
  raw.hourly.precipitation_probability[1] = 80;
  cacheWeather(normalizeWeather(raw, asheville, fixtureTime));
});
it('moves focus into each new view and back to the forecast after selecting a saved place', () => {
  render(<App/>);
  const nav = within(screen.getByRole('navigation'));
  nav.getByRole('button', { name: 'Places' }).focus();
  fireEvent.click(nav.getByRole('button', { name: 'Places' }));
  expect(screen.getByRole('main')).toHaveFocus();
  const saved = screen.getByRole('button', { name: 'Asheville North Carolina, United States' });
  expect(saved).toHaveAttribute('aria-current', 'location');
  saved.focus(); fireEvent.click(saved);
  expect(screen.getByRole('main')).toHaveFocus();
  fireEvent.click(nav.getByRole('button', { name: 'Settings' }));
  expect(screen.getByRole('main')).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
});
it('pairs current rain with the interval ahead and exposes hourly conditions and percentage meaning', () => {
  render(<App/>);
  const stats = screen.getByText('Chance of precipitation this hour').closest('div')!;
  expect(stats).toHaveTextContent('80%');
  const hourly = screen.getByRole('region', { name: 'Next 24 hours' });
  const first = within(hourly).getByText('Now').closest('.hour')!;
  expect(first).toHaveTextContent('Thunderstorms');
  expect(first).toHaveTextContent('Chance of precipitation: 80%');
});
