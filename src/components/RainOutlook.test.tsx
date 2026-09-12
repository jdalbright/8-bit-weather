import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Today from './Today';
import { RainOutlook } from './RainOutlook';
import { upcomingRain } from '../lib/rain';
import { deriveScene } from '../lib/scene';
import { normalizeWeather, STALE_AFTER } from '../lib/weather';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';

function rainySnapshot() {
  const raw = forecastFixture();
  raw.minutely_15.rain[3] = 0.4;
  raw.minutely_15.showers[4] = 1.27;
  return normalizeWeather(raw, asheville, fixtureTime);
}
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});

describe('rain outlook interactions', () => {
  it('opens radar through its shortcut without changing the rain forecast', () => {
    const snapshot = rainySnapshot(), outlook = upcomingRain(snapshot, fixtureTime, true)!;
    const open = vi.fn();
    render(<RainOutlook outlook={outlook} timezone={snapshot.timezone} now={fixtureTime} units="imperial" onRadar={open}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Open radar' }));
    expect(open).toHaveBeenCalledOnce();
    expect(screen.getByText('Forecast estimate · timing may shift.')).toBeInTheDocument();
  });
  it('shows local forecast timing and changes the selected amount and units', () => {
    const snapshot = rainySnapshot(), outlook = upcomingRain(snapshot, fixtureTime, true)!;
    const props = { outlook, timezone: snapshot.timezone, now: fixtureTime };
    const { rerender } = render(<RainOutlook {...props} units="imperial"/>);
    expect(screen.getByText('Rain possible around 10:30 AM')).toBeInTheDocument();
    const slider = screen.getByRole('slider', { name: 'Rain forecast time' });
    expect(slider).toHaveAttribute('aria-valuetext', '10:30 AM–10:45 AM · 0.02 in of rain');
    fireEvent.change(slider, { target: { value: '3' } });
    expect(screen.getByRole('status')).toHaveTextContent('10:45 AM–11:00 AM · 0.05 in of rain');
    rerender(<RainOutlook {...props} units="metric"/>);
    expect(screen.getByRole('status')).toHaveTextContent('10:45 AM–11:00 AM · 1.3 mm of rain');
    // Units are formatted locally; retaining the selection doesn't require an API request.
    expect(screen.getByRole('slider')).toHaveValue('3');
  });
  it('uses the selected location timezone, even when it is already the next day there', () => {
    const snapshot = rainySnapshot(), outlook = upcomingRain(snapshot, fixtureTime, true)!;
    render(<RainOutlook outlook={outlook} timezone="Australia/Sydney" now={fixtureTime} units="metric"/>);
    expect(screen.getByText('Rain possible around 12:30 AM')).toBeInTheDocument();
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '12:30 AM–12:45 AM · 0.4 mm of rain');
  });
  it('moves away from an expired selection as time advances', () => {
    const snapshot = rainySnapshot();
    const { rerender } = render(<RainOutlook outlook={upcomingRain(snapshot, fixtureTime, true)!} timezone={snapshot.timezone} now={fixtureTime} units="metric"/>);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '0' } });
    expect(screen.getByRole('status')).toHaveTextContent('10:00 AM–10:15 AM · 0 mm of rain');
    const later = fixtureTime + 15 * 60000;
    rerender(<RainOutlook outlook={upcomingRain(snapshot, later, true)!} timezone={snapshot.timezone} now={later} units="metric"/>);
    expect(screen.getByRole('status')).toHaveTextContent('10:30 AM–10:45 AM · 0.4 mm of rain');
  });
  it('appears in Today for upcoming rain and disappears on a dry refresh, offline, stale, or old cache', () => {
    const snapshot = rainySnapshot();
    const props = { place: asheville, snapshot, scene: deriveScene(snapshot, fixtureTime, true), units: 'imperial' as const, animate: false,
      loading: false, error: null, online: true, now: fixtureTime, locating: false,
      onLocate: vi.fn(), onPlaces: vi.fn(), onRefresh: vi.fn(), onDiscover: vi.fn() };
    const { rerender } = render(<Today {...props}/>);
    expect(screen.getByRole('region', { name: 'Rain outlook' })).toBeInTheDocument();
    const hiddenStates = [
      { snapshot: normalizeWeather(forecastFixture(), asheville, fixtureTime) },
      { online: false },
      { now: fixtureTime + STALE_AFTER },
      { snapshot: { ...snapshot, minutely: undefined } },
    ];
    for (const state of hiddenStates) {
      rerender(<Today {...props} {...state}/>);
      expect(screen.queryByRole('region', { name: 'Rain outlook' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Next 24 hours' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '7-day forecast' })).toBeInTheDocument();
    }
    rerender(<Today {...props}/>);
    expect(screen.getByRole('region', { name: 'Rain outlook' })).toBeInTheDocument();
  });
});
