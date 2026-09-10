import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Today from './Today';
import { SunTimes } from './SunTimes';
import { welcomeScene } from '../lib/scene';
import { normalizeWeather } from '../lib/weather';
import { asheville, fixtureTime, forecastFixture, tokyo } from '../test/fixtures';

function props() {
  return { place: asheville, snapshot: normalizeWeather(forecastFixture(), asheville, fixtureTime), scene: welcomeScene,
    units: 'imperial' as const, animate: false, loading: false, error: null, online: true, now: fixtureTime,
    locating: false, onLocate: vi.fn(), onPlaces: vi.fn(), onRefresh: vi.fn(), onDiscover: vi.fn() };
}
const row = () => within(screen.getByLabelText("Today's sunrise and sunset"));
const seconds = (date: string) => Date.parse(date) / 1000;

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));

describe('sunrise and sunset times', () => {
  it('uses the selected location’s date and timezone when it is already tomorrow there', () => {
    const input = props();
    input.snapshot.timezone = 'Asia/Tokyo';
    input.snapshot.daily[1].sunrise = seconds('2026-09-07T20:24:00Z');
    input.snapshot.daily[1].sunset = seconds('2026-09-08T09:56:00Z');
    render(<Today {...input} place={tokyo} now={Date.parse('2026-09-07T22:00:00Z')}/>);
    expect(row().getByText('5:24 AM')).toHaveAttribute('dateTime', '2026-09-07T20:24:00.000Z');
    expect(row().getByText('6:56 PM')).toBeInTheDocument();
  });

  it('keeps today’s times after sunset and switches days at local midnight', () => {
    const input = props();
    input.snapshot.daily[1].sunrise! += 60;
    input.snapshot.daily[1].sunset! -= 60;
    const { rerender } = render(<Today {...input} now={Date.parse('2026-09-08T03:59:00Z')}/>);
    expect(row().getByText('7:00 AM')).toBeInTheDocument();
    expect(row().getByText('7:00 PM')).toBeInTheDocument();
    rerender(<Today {...input} now={Date.parse('2026-09-08T04:00:00Z')}/>);
    expect(row().getByText('7:01 AM')).toBeInTheDocument();
    expect(row().getByText('6:59 PM')).toBeInTheDocument();
  });

  it('formats each event with its timezone’s daylight-saving offset', () => {
    const day = { ...props().snapshot.daily[0], date: '2026-11-01',
      sunrise: seconds('2026-11-01T11:54:00Z'), sunset: seconds('2026-11-01T22:33:00Z') };
    render(<SunTimes day={day} timezone="America/New_York"/>);
    expect(row().getByText('6:54 AM')).toBeInTheDocument();
    expect(row().getByText('5:33 PM')).toBeInTheDocument();
  });

  it.each([null, NaN, Infinity, 1e20, 0])('shows an accessible unavailable reading for invalid sunrise %s', sunrise => {
    const day = { ...props().snapshot.daily[0], sunrise };
    render(<SunTimes day={day} timezone="America/New_York"/>);
    expect(row().getByText('Unavailable')).toBeInTheDocument();
    expect(row().getByText('—')).toHaveAttribute('aria-hidden', 'true');
    expect(row().getByText('7:00 PM')).toBeInTheDocument();
  });

  it('keeps cached times offline but does not substitute another day when today expires', () => {
    const input = props();
    const { rerender } = render(<Today {...input} online={false}/>);
    expect(screen.getByText('You’re offline. Showing your saved forecast.')).toBeInTheDocument();
    expect(row().getByText('7:00 AM')).toBeInTheDocument();
    rerender(<Today {...input} online={false} now={fixtureTime + 8 * 86400000}/>);
    expect(row().getAllByText('Unavailable')).toHaveLength(2);
    expect(row().queryByText('7:00 AM')).not.toBeInTheDocument();
    rerender(<Today {...input} snapshot={null}/>);
    expect(screen.queryByLabelText("Today's sunrise and sunset")).not.toBeInTheDocument();
  });
});
