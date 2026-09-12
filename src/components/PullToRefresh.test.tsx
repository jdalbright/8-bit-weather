import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PullToRefresh } from './PullToRefresh';
import { useWeather } from '../hooks/useWeather';
import { fetchWeather, WeatherRequestError } from '../lib/api';
import { normalizeWeather as normalizeLegacyWeather } from '../lib/weather';
import { cacheWeather } from '../lib/storage';
import { asheville, forecastFixture } from '../test/fixtures';
import type { WeatherSnapshot } from '../types';

vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal<typeof import('../lib/api')>(), fetchWeather: vi.fn() }));
const mockedFetch = vi.mocked(fetchWeather);
const touch = (x: number, y: number, identifier = 1) => ({ identifier, clientX: x, clientY: y });
function start(target: Element, x = 100, y = 150) { fireEvent.touchStart(target, { touches: [touch(x, y)] }); }
function move(target: Element, x = 100, y = 300, cancelable = true) {
  const event = createEvent.touchMove(target, { touches: [touch(x, y)], cancelable });
  fireEvent(target, event);
  return event;
}
function end(target: Element) { fireEvent.touchEnd(target, { touches: [] }); }
function pull(target: Element) { start(target); move(target); end(target); }
function TestSurface({ enabled = true, disabled = false, onRefresh = vi.fn().mockResolvedValue(undefined) }) {
  return <PullToRefresh enabled={enabled} disabled={disabled} onRefresh={onRefresh}>
    <p>Forecast surface</p><button>Change location</button><input aria-label="Forecast hour" type="range"/>
    <div data-pull-refresh-ignore>Hourly forecast</div>
  </PullToRefresh>;
}
function WeatherSurface() {
  const weather = useWeather(asheville);
  return <PullToRefresh enabled disabled={weather.loading || !weather.online} onRefresh={async () => { await weather.refresh(true); }}>
    <p>Forecast surface</p>
    <output aria-label="Temperature">{weather.snapshot?.current.temperature}</output>
    {weather.error ? <p role="alert">{weather.error}</p> : null}
  </PullToRefresh>;
}

beforeEach(() => {
  mockedFetch.mockReset();
  vi.stubGlobal('scrollY', 0);
  vi.stubGlobal('visualViewport', { scale: 1 });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

describe('pull to refresh', () => {
  it('refreshes fresh cached weather once on release and keeps it visible while fetching', async () => {
    cacheWeather(normalizeWeather(forecastFixture(Date.now()), asheville));
    let resolve!: (snapshot: WeatherSnapshot) => void;
    mockedFetch.mockImplementation(() => new Promise(done => { resolve = done; }));
    render(<WeatherSurface/>);
    const surface = screen.getByText('Forecast surface');
    const oldTemperature = screen.getByLabelText('Temperature').textContent;
    expect(oldTemperature).not.toBe('');
    expect(mockedFetch).not.toHaveBeenCalled();
    start(surface);
    expect(move(surface, 100, 200).defaultPrevented).toBe(true);
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Pull to refresh');
    move(surface);
    expect(screen.getByText('Release to refresh')).toBeInTheDocument();
    expect(mockedFetch).not.toHaveBeenCalled();
    end(surface);
    expect(screen.getByText('Refreshing…')).toBeInTheDocument();
    expect(screen.getByLabelText('Temperature')).toHaveTextContent(oldTemperature!);
    pull(surface);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const next = normalizeWeather(forecastFixture(Date.now()), asheville);
    next.current.temperature = 27;
    await act(async () => resolve(next));
    expect(screen.getByLabelText('Temperature')).toHaveTextContent('27');
    expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
  });

  it('cancels a short pull or one that is pulled back below the threshold', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    start(surface); move(surface, 100, 200); end(surface);
    expect(screen.queryByText('Pull to refresh')).not.toBeInTheDocument();
    start(surface); move(surface); move(surface, 100, 180); end(surface);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Release to refresh')).not.toBeInTheDocument();
  });

  it('leaves scrolling alone when the gesture starts away from the top, even if it reaches the top', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    vi.stubGlobal('scrollY', 250);
    start(surface);
    vi.stubGlobal('scrollY', 0);
    expect(move(surface).defaultPrevented).toBe(false);
    end(surface);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it.each([[200, 165], [100, 100]])('does not claim a horizontal or upward gesture (%i, %i)', (x, y) => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    start(surface);
    expect(move(surface, x, y).defaultPrevented).toBe(false);
    expect(move(surface).defaultPrevented).toBe(false);
    end(surface);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('preserves buttons, sliders, and the hourly rail', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    for (const target of [screen.getByRole('button'), screen.getByRole('slider'), screen.getByText('Hourly forecast')]) {
      start(target);
      expect(move(target).defaultPrevented).toBe(false);
      end(target);
    }
    fireEvent.change(screen.getByRole('slider'), { target: { value: '75' } });
    expect(screen.getByRole('slider')).toHaveValue('75');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('cancels multi-touch and touchcancel, leaving pinch gestures untouched', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    start(surface); move(surface);
    const pinch = createEvent.touchMove(surface, { touches: [touch(100, 300), touch(150, 300, 2)], cancelable: true });
    fireEvent(surface, pinch);
    expect(pinch.defaultPrevented).toBe(false);
    end(surface);
    start(surface); move(surface); fireEvent.touchCancel(surface); end(surface);
    vi.stubGlobal('visualViewport', { scale: 2 });
    start(surface);
    expect(move(surface).defaultPrevented).toBe(false);
    end(surface);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Release to refresh')).not.toBeInTheDocument();
  });

  it('cancels if the browser takes over scrolling or the page loses focus', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    start(surface); move(surface); move(surface, 100, 310, false); end(surface);
    start(surface); move(surface); fireEvent.blur(window); end(surface);
    start(surface); move(surface); vi.stubGlobal('scrollY', 100); fireEvent.scroll(window); end(surface);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(screen.queryByText('Release to refresh')).not.toBeInTheDocument();
  });

  it('ignores mouse drags, unavailable weather, offline state, and an already-running refresh', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    fireEvent.mouseDown(surface, { clientY: 150 }); fireEvent.mouseMove(surface, { clientY: 300 }); fireEvent.mouseUp(surface);
    rerender(<TestSurface onRefresh={onRefresh} enabled={false}/>); pull(surface);
    rerender(<TestSurface onRefresh={onRefresh} disabled/>); pull(surface);
    rerender(<TestSurface onRefresh={onRefresh}/>);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    pull(surface);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('checks the latest disabled state and refresh callback when releasing', async () => {
    const first = vi.fn().mockResolvedValue(undefined), latest = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<TestSurface onRefresh={first}/>);
    const surface = screen.getByText('Forecast surface');
    start(surface); move(surface);
    rerender(<TestSurface onRefresh={first} disabled/>); end(surface);
    expect(first).not.toHaveBeenCalled();
    rerender(<TestSurface onRefresh={first}/>);
    start(surface); move(surface);
    rerender(<TestSurface onRefresh={latest}/>);
    await act(async () => end(surface));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('keeps saved weather and shows the existing error on failure, respecting cooldown on another pull', async () => {
    cacheWeather(normalizeWeather(forecastFixture(Date.now()), asheville));
    mockedFetch.mockRejectedValue(new WeatherRequestError('Service busy. Try again shortly.', 60000));
    render(<WeatherSurface/>);
    const surface = screen.getByText('Forecast surface');
    const savedTemperature = screen.getByLabelText('Temperature').textContent;
    await act(async () => pull(surface));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Service busy'));
    expect(screen.getByLabelText('Temperature')).toHaveTextContent(savedTemperature!);
    expect(screen.queryByText('Refreshing…')).not.toBeInTheDocument();
    await act(async () => pull(surface));
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('cleans up on navigation and ignores a release after unmounting', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<TestSurface onRefresh={onRefresh}/>);
    const surface = screen.getByText('Forecast surface');
    expect(document.documentElement).toHaveClass('weather-pull-refresh');
    start(surface); move(surface); unmount(); end(surface);
    expect(document.documentElement).not.toHaveClass('weather-pull-refresh');
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

function normalizeWeather(...args: Parameters<typeof normalizeLegacyWeather>) {
  const s = normalizeLegacyWeather(...args);
  return { ...s, provider: 'xweather' as const, sectionTimes: { current: s.fetchedAt, forecast: s.fetchedAt },
    refreshAfter: Math.min(s.fetchedAt+600000,Math.max(s.current.time*1000+900000,s.fetchedAt+60000)) };
}
