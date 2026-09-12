import { describe, expect, it } from 'vitest';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';
import { normalizeWeather, STALE_AFTER } from './weather';
import { rainAmount, upcomingRain } from './rain';

function rainySnapshot() {
  const raw = forecastFixture();
  raw.minutely_15.rain[3] = 0.4;
  raw.minutely_15.showers[3] = 0.2;
  return normalizeWeather(raw, asheville, fixtureTime);
}

describe('conditional rain outlook', () => {
  it('adds rain and showers and uses interval starts for upcoming timing', () => {
    const outlook = upcomingRain(rainySnapshot(), fixtureTime, true)!;
    expect(outlook.periods).toHaveLength(4);
    expect(outlook.firstRainIndex).toBe(2);
    expect(outlook.periods[2].time).toBe(fixtureTime / 1000 + 45 * 60);
    expect(outlook.periods[2].amount).toBeCloseTo(0.6);
  });
  it('stays hidden for dry forecasts, high rain probabilities without predicted amounts, and snow alone', () => {
    const raw = forecastFixture(fixtureTime, 73);
    raw.hourly.precipitation_probability.fill(90);
    expect(upcomingRain(normalizeWeather(raw, asheville, fixtureTime), fixtureTime, true)).toBeNull();
  });
  it('does not trigger on trace amounts', () => {
    const raw = forecastFixture(); raw.minutely_15.rain.fill(0.01);
    expect(upcomingRain(normalizeWeather(raw, asheville, fixtureTime), fixtureTime, true)).toBeNull();
  });
  it('includes rain during the current interval, but never an interval that has ended', () => {
    const raw = forecastFixture(); raw.minutely_15.rain[1] = 0.5;
    const snapshot = normalizeWeather(raw, asheville, fixtureTime);
    expect(upcomingRain(snapshot, fixtureTime + 14 * 60000, true)?.firstRainIndex).toBe(0);
    expect(upcomingRain(snapshot, fixtureTime + 15 * 60000, true)).toBeNull();
  });
  it('includes the last overlapping interval but excludes rain starting at or beyond one hour', () => {
    const raw = forecastFixture(); raw.minutely_15.rain[5] = 0.5;
    const snapshot = normalizeWeather(raw, asheville, fixtureTime);
    expect(upcomingRain(snapshot, fixtureTime, true)).toBeNull();
    expect(upcomingRain(snapshot, fixtureTime + 5 * 60000, true)?.periods).toHaveLength(5);
    raw.minutely_15.rain[5] = 0; raw.minutely_15.rain[6] = 0.5;
    expect(upcomingRain(normalizeWeather(raw, asheville, fixtureTime), fixtureTime + 5 * 60000, true)).toBeNull();
  });
  it('hides offline, old, future-dated, and stale-observation forecasts', () => {
    const snapshot = rainySnapshot();
    expect(upcomingRain(snapshot, fixtureTime, false)).toBeNull();
    expect(upcomingRain(snapshot, fixtureTime + STALE_AFTER, true)).toBeNull();
    expect(upcomingRain(snapshot, fixtureTime - 1, true)).toBeNull();
    expect(upcomingRain({ ...snapshot, current: { ...snapshot.current, time: fixtureTime / 1000 - 3601 } }, fixtureTime, true)).toBeNull();
  });
  it('hides missing, gapped, expired, or unknown intervals instead of implying dry weather', () => {
    const snapshot = rainySnapshot();
    expect(upcomingRain({ ...snapshot, minutely: undefined }, fixtureTime, true)).toBeNull();
    expect(upcomingRain({ ...snapshot, minutely: [] }, fixtureTime, true)).toBeNull();
    expect(upcomingRain({ ...snapshot, minutely: snapshot.minutely!.filter((_, i) => i !== 3) }, fixtureTime, true)).toBeNull();
    expect(upcomingRain({ ...snapshot, minutely: snapshot.minutely!.map((r, i) => i === 4 ? { ...r, amount: null } : r) }, fixtureTime, true)).toBeNull();
    expect(upcomingRain({ ...snapshot, minutely: snapshot.minutely!.map(r => ({ ...r, time: r.time - 86400 })) }, fixtureTime, true)).toBeNull();
  });
  it('preserves missing or invalid measurements without breaking the rest of the forecast', () => {
    const raw = forecastFixture();
    const snapshot = normalizeWeather({ ...raw, minutely_15: { ...raw.minutely_15, rain: [null, -1, '0.5', Infinity, 0.5], showers: [0, 0, 0, 0, null] } }, asheville, fixtureTime);
    expect(snapshot.minutely?.every(r => r.amount === null)).toBe(true);
    expect(snapshot.daily).toHaveLength(7);
    expect(normalizeWeather({ ...raw, minutely_15: undefined }, asheville, fixtureTime).minutely).toEqual([]);
  });
  it('formats rain in either unit system without rounding light rain down to zero', () => {
    expect(rainAmount(0.1, 'imperial')).toBe('<0.01 in');
    expect(rainAmount(25.4, 'imperial')).toBe('1.00 in');
    expect(rainAmount(0.05, 'metric')).toBe('<0.1 mm');
    expect(rainAmount(0.6, 'metric')).toBe('0.6 mm');
    expect(rainAmount(0, 'metric')).toBe('0 mm');
  });
});

describe('Xweather next-hour coverage', () => {
  function snapshot() {
    const s = normalizeWeather(forecastFixture(),asheville,fixtureTime);
    return {...s,provider:'xweather' as const,sectionTimes:{current:fixtureTime,forecast:fixtureTime,rain:fixtureTime},
      minutely:Array.from({length:60},(_,i)=>({time:fixtureTime/1000+(i+1)*60,interval:60,amount:0.01}))};
  }
  it('uses equivalent rate sensitivity and retains only unelapsed minutes',()=> {
    expect(upcomingRain(snapshot(),fixtureTime,true)?.periods).toHaveLength(60);
    expect(upcomingRain(snapshot(),fixtureTime+5*60000,true)?.periods).toHaveLength(55);
    const trace=snapshot();trace.minutely.forEach(p=>p.amount=0.001);
    expect(upcomingRain(trace,fixtureTime,true)).toBeNull();
  });
  it('never extrapolates a missing minute, final minute, or expired prediction',()=> {
    for(const i of [0,25,59]) {
      const s=snapshot();s.minutely.splice(i,1);
      expect(upcomingRain(s,fixtureTime,true)).toBeNull();
    }
    expect(upcomingRain(snapshot(),fixtureTime+600000,true)).toBeNull();
  });
});
