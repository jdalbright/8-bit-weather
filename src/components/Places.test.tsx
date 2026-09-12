import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { asheville, tokyo } from '../test/fixtures';
import type { Place } from '../types';
import Places from './Places';

function SavedPlaces({ initial = [asheville, tokyo] }: { initial?: Place[] }) {
  const [places, setPlaces] = useState(initial);
  return <Places places={places} selected={asheville} locating={false} onLocate={vi.fn()} onSelect={vi.fn()}
    onRemove={id => setPlaces(previous => previous.filter(place => place.id !== id))}/>;
}

it('retries a failed city search without editing its query', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ results: [{ ...asheville, admin1: asheville.region }] }));
  vi.stubGlobal('fetch', fetcher);
  render(<SavedPlaces initial={[]}/>);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find a city' }), { target: { value: 'Asheville' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(screen.getByRole('alert')).toHaveTextContent('City search is temporarily unavailable. Please try again.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry search' }));
  expect(screen.getByRole('searchbox')).toHaveFocus();
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('searchbox')).toHaveValue('Asheville');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Asheville North Carolina, United States' })).toBeInTheDocument();
});

it('ignores an old retry response after the user searches for another city', async () => {
  vi.useFakeTimers();
  let resolveRetry!: (response: Response) => void;
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRetry = resolve; }))
    .mockResolvedValueOnce(Response.json({ results: [{ ...tokyo, admin1: tokyo.region }] }));
  vi.stubGlobal('fetch', fetcher);
  render(<SavedPlaces initial={[]}/>);
  const search = screen.getByRole('searchbox', { name: 'Find a city' });
  fireEvent.change(search, { target: { value: 'Asheville' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  fireEvent.click(screen.getByRole('button', { name: 'Retry search' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  const retrySignal = fetcher.mock.calls[1][1].signal as AbortSignal;
  fireEvent.change(search, { target: { value: 'Tokyo' } });
  expect(retrySignal.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(350); });
  await act(async () => { resolveRetry(Response.json({ results: [{ ...asheville, admin1: asheville.region }] })); });
  expect(screen.getByRole('button', { name: 'Tokyo Tokyo, Japan' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Asheville North Carolina, United States' })).not.toBeInTheDocument();
  expect(search).toHaveFocus();
});

it('moves focus from a removed place to the next remaining place', () => {
  render(<SavedPlaces/>);
  const remove = screen.getByRole('button', { name: 'Remove Asheville from saved places' });
  remove.focus(); fireEvent.click(remove);
  expect(screen.getByRole('button', { name: 'Tokyo Tokyo, Japan' })).toHaveFocus();
});

it('moves focus to city search when the final focused place is removed', () => {
  render(<SavedPlaces initial={[asheville]}/>);
  const remove = screen.getByRole('button', { name: 'Remove Asheville from saved places' });
  remove.focus(); fireEvent.click(remove);
  expect(screen.getByRole('searchbox', { name: 'Find a city' })).toHaveFocus();
});

it('does not move focus when removal is triggered from an unfocused button', () => {
  render(<SavedPlaces/>);
  const search = screen.getByRole('searchbox', { name: 'Find a city' });
  search.focus();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Asheville from saved places' }));
  expect(search).toHaveFocus();
});
