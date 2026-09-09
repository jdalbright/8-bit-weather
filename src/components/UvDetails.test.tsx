import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import Today from './Today';
import { deriveScene } from '../lib/scene';
import { normalizeWeather, STALE_AFTER } from '../lib/weather';
import { asheville, fixtureTime, uvFixture } from '../test/fixtures';

function props() {
  const snapshot = normalizeWeather(uvFixture(), asheville, fixtureTime);
  return { place:asheville,snapshot,scene:deriveScene(snapshot,fixtureTime,true),units:'imperial' as const,animate:false,
    loading:false,error:null,online:true,now:fixtureTime,locating:false,onLocate:vi.fn(),onPlaces:vi.fn(),onRefresh:vi.fn(),onDiscover:vi.fn() };
}
beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }));
describe('expandable UV forecast', () => {
  it('starts compact, expands from the UV tile, selects an hour, and collapses', () => {
    render(<Today {...props()}/>);
    const button = screen.getByRole('button',{name:'UV index 4, Moderate, show details'});
    expect(button).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('region',{name:'A little sun sense'})).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded','true');
    expect(screen.getByText(/Today’s peak:/)).toHaveTextContent('UV 7 · High around 1 PM');
    expect(screen.getByText('Low UV forecast from around 5 PM.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider',{name:'UV forecast hour'}),{target:{value:'13'}});
    expect(within(screen.getByRole('region', { name: 'A little sun sense' })).getByRole('status')).toHaveTextContent('1 PM EDT · UV 7 · High');
    fireEvent.click(button);
    expect(screen.queryByRole('slider',{name:'UV forecast hour'})).not.toBeInTheDocument();
  });
  it('keeps zero UV visible at night and gives nighttime wording', () => {
    const input = props(), night = input.snapshot.daily[0].time + 23*3600;
    input.snapshot.current = {...input.snapshot.current,time:night,uv:0,isDay:false}; input.snapshot.fetchedAt = night*1000;
    input.now = night*1000; input.scene = deriveScene(input.snapshot,input.now,true);
    render(<Today {...input}/>);
    fireEvent.click(screen.getByRole('button',{name:'UV index 0, Low, show details'}));
    expect(screen.getByText('UV is low at night. Check the daytime forecast before heading out.')).toBeInTheDocument();
    expect(screen.getByText(/Today’s peak:/)).toHaveTextContent('UV 7 · High around 1 PM');
  });
  it('shows unavailable UV for old caches without hiding the normal weather or inventing a value', () => {
    const input = props(); delete input.snapshot.current.uv; input.snapshot.hourly.forEach(h=>delete h.uv); input.snapshot.daily.forEach(d=>delete d.uvMax);
    render(<Today {...input}/>);
    fireEvent.click(screen.getByRole('button',{name:'UV index unavailable, show details'}));
    expect(screen.getByText('Current UV is unavailable. Try refreshing the forecast.')).toBeInTheDocument();
    expect(screen.getByText('Hourly UV is unavailable for today.')).toBeInTheDocument();
    expect(screen.queryByRole('slider',{name:'UV forecast hour'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'7-day forecast'})).toBeInTheDocument();
  });
  it('marks offline and stale UV as saved and removes current sun advice and drop timing', () => {
    const input = props(); const {rerender}=render(<Today {...input}/>);
    fireEvent.click(screen.getByRole('button',{name:'UV index 4, Moderate, show details'}));
    rerender(<Today {...input} online={false}/>);
    expect(screen.getByRole('button',{name:'UV index unavailable, hide details'})).toHaveTextContent('Saved');
    expect(screen.getByText('Saved UV forecast. Connect and refresh for current conditions.')).toBeInTheDocument();
    expect(screen.queryByText(/Low UV forecast from/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seek shade around midday/)).not.toBeInTheDocument();
    rerender(<Today {...input} now={fixtureTime+STALE_AFTER}/>);
    expect(screen.getByText('Saved UV forecast. Refresh for current conditions.')).toBeInTheDocument();
  });
});
