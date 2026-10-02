import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { BestTimeOutside } from './BestTimeOutside';
import { outdoorSnapshot } from '../test/outdoor-fixtures';
import { fixtureTime } from '../test/fixtures';
import { outdoorWindows } from '../lib/outdoor';
import { generateOutdoorRecommendation, OutdoorError } from '../lib/outdoor-client';
import { OUTDOOR_VERSION, type OutdoorRecommendation } from '../lib/outdoor-ai';

vi.mock('../lib/outdoor-client', async original => ({ ...await original<typeof import('../lib/outdoor-client')>(), generateOutdoorRecommendation: vi.fn() }));
const now = fixtureTime + 1800000;
const day = () => screen.getByRole('button', { name: 'Today' });
const generate = () => fireEvent.click(screen.getByRole('button', { name: 'Ask OpenAI' }));
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.mocked(generateOutdoorRecommendation).mockReset().mockImplementation(async request => {
    const eligible = outdoorWindows(request.forecast, now, request.day, request.period);
    if (eligible.status !== 'recommended') throw new Error('fixture');
    return { version: OUTDOOR_VERSION, start: (request.day === 'tomorrow' ? eligible.windows.find(hour => hour.start === Date.parse('2026-09-08T16:00Z') / 1000) : null)?.start ?? eligible.windows[0].start, text: 'Mild air and light wind make this a pleasant hour to head outside.', generatedAt: now, expiresAt: now + 900000 };
  });
});

it('waits for a click, then generates and previews tomorrow beyond 24 hours', async () => {
  const onPreview = vi.fn();
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={onPreview}/>);
  expect(day()).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByText('11:00 AM')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
  expect(generateOutdoorRecommendation).not.toHaveBeenCalled();
  generate();
  await screen.findByRole('button', { name: 'Preview this hour' });
  expect(screen.getByRole('status')).toHaveTextContent('12:00 PM–1:00 PM');
  expect(screen.getByRole('status')).toHaveTextContent('Temperature72°');
  expect(screen.getByRole('status')).toHaveTextContent('AI recommendation · OpenAI');
  fireEvent.click(screen.getByRole('button', { name: 'Preview this hour' }));
  expect(onPreview).toHaveBeenCalledWith(Date.parse('2026-09-08T16:00Z') / 1000);
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
});

it('preserves a generated result through unit changes and disconnecting, but does not generate offline', async () => {
  const snapshot = outdoorSnapshot();
  const { rerender } = render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
  generate();
  await screen.findByText(/Mild air/);
  rerender(<BestTimeOutside snapshot={{ ...snapshot, fetchedAt: now }} now={now} online={false} units="metric"/>);
  expect(screen.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('status')).toHaveTextContent('Temperature22°');
  expect(screen.getByRole('status')).toHaveTextContent('Wind8 km/h');
  expect(screen.getByRole('status')).toHaveTextContent('Saved AI recommendation');
  fireEvent.click(day());
  expect(screen.getByRole('status')).toHaveTextContent('Connect to generate');
  expect(screen.getByRole('button', { name: 'Ask OpenAI' })).toBeDisabled();
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
});

it.each(['location', 'date'] as const)('resets filters on a changed %s', change => {
  const snapshot = outdoorSnapshot();
  const { rerender } = render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial"/>);
  fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
  rerender(<BestTimeOutside snapshot={change === 'location' ? { ...snapshot, latitude: 36 } : snapshot} now={change === 'date' ? now + 86400000 : now} online units="imperial"/>);
  expect(day()).toHaveAttribute('aria-pressed', 'true');
});

it('distinguishes poor conditions, missing data, and no remaining full daylight hour without calling AI', () => {
  const snapshot = outdoorSnapshot(); snapshot.hourly.forEach(hour => { hour.code = 95; });
  const { rerender } = render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial"/>);
  expect(screen.getByRole('status')).toHaveTextContent('No comfortable window');
  snapshot.hourly = [];
  rerender(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial"/>);
  expect(screen.getByRole('status')).toHaveTextContent('Forecast details unavailable');
  const night = Date.parse('2026-09-07T23:30Z'); snapshot.sectionTimes.forecast = night;
  rerender(<BestTimeOutside snapshot={snapshot} now={night} online units="imperial"/>);
  expect(screen.getByRole('status')).toHaveTextContent('No daylight remaining');
  expect(screen.getByRole('button', { name: 'Ask OpenAI' })).toBeDisabled();
  expect(generateOutdoorRecommendation).not.toHaveBeenCalled();
});

it('keeps generation available on a hot day and labels the result as a compromise', async () => {
  const snapshot = outdoorSnapshot();
  snapshot.hourly.forEach(hour => { hour.temperature = 32; });
  render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial" onPreview={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Ask OpenAI' })).toBeEnabled();
  expect(screen.getByRole('status')).toHaveTextContent('No hour meets every comfort preference');
  generate();
  await screen.findByRole('button', { name: 'Preview this hour' });
  expect(screen.getByRole('status')).toHaveTextContent('Best available hour');
  expect(screen.getByRole('status')).toHaveTextContent('Temperature90°');
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
});

it('keeps the unavailable action visible and explains it without sending a request', () => {
  const snapshot = outdoorSnapshot();
  snapshot.hourly.forEach(hour => { hour.wind = null; });
  render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial"/>);
  const button = screen.getByRole('button', { name: 'Ask OpenAI' });
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(/Forecast details unavailable/);
  fireEvent.click(button);
  expect(generateOutdoorRecommendation).not.toHaveBeenCalled();
});

it('withdraws expired results even if current conditions refresh', async () => {
  const snapshot = outdoorSnapshot();
  const { rerender } = render(<BestTimeOutside snapshot={snapshot} now={now} online units="imperial" onPreview={vi.fn()}/>);
  generate(); await screen.findByRole('button', { name: 'Preview this hour' });
  snapshot.fetchedAt = fixtureTime + 3600001;
  snapshot.sectionTimes.current = snapshot.fetchedAt;
  rerender(<BestTimeOutside snapshot={snapshot} now={snapshot.fetchedAt} online={false} units="imperial" onPreview={vi.fn()}/>);
  expect(screen.getByRole('status')).toHaveTextContent('Forecast details unavailable');
  expect(screen.queryByRole('button', { name: 'Preview this hour' })).not.toBeInTheDocument();
});

it('shows loading, suppresses duplicate clicks, and cancels a changed filter request', async () => {
  const response: OutdoorRecommendation = { version: OUTDOOR_VERSION, start: Date.parse('2026-09-07T15:00Z') / 1000, text: 'Mild air and light wind.', generatedAt: now, expiresAt: now + 900000 };
  let resolve!: (value: typeof response) => void;
  vi.mocked(generateOutdoorRecommendation).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={vi.fn()}/>);
  generate();
  expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Generating…' }));
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
  const signal = vi.mocked(generateOutdoorRecommendation).mock.calls[0][1];
  fireEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(response));
  expect(screen.queryByRole('button', { name: 'Preview this hour' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ask OpenAI' })).toBeEnabled();
});

it('shows an honest error and retries only on another click', async () => {
  vi.mocked(generateOutdoorRecommendation).mockRejectedValueOnce(new OutdoorError('AI couldn’t generate a recommendation. Please try again.'));
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={vi.fn()}/>);
  generate();
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('AI couldn’t generate'));
  expect(screen.queryByRole('button', { name: 'Preview this hour' })).not.toBeInTheDocument();
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('button', { name: 'Preview this hour' });
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(2);
});

it('shows a real-time response immediately when the parent clock predates generation', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.mocked(generateOutdoorRecommendation).mockImplementationOnce(async () => {
    vi.mocked(Date.now).mockReturnValue(now + 2000);
    return { version: OUTDOOR_VERSION, start: Date.parse('2026-09-07T16:00Z') / 1000,
      text: 'Mild air and light wind.', generatedAt: now + 2000, expiresAt: now + 902000 };
  });
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={vi.fn()}/>);
  await act(async () => generate());
  expect(screen.getByRole('button', { name: 'Preview this hour' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ask OpenAI' })).not.toBeInTheDocument();
});

it('keeps a valid recommendation when only the current hour changes', async () => {
  const snapshot = outdoorSnapshot();
  snapshot.sectionTimes.forecast = fixtureTime + 50 * 60000;
  const before = fixtureTime + 59 * 60000, after = fixtureTime + 61 * 60000;
  vi.spyOn(Date, 'now').mockReturnValue(before);
  vi.mocked(generateOutdoorRecommendation).mockResolvedValueOnce({ version: OUTDOOR_VERSION,
    start: Date.parse('2026-09-07T16:00Z') / 1000, text: 'Mild air and light wind.', generatedAt: before, expiresAt: before + 900000 });
  const { rerender } = render(<BestTimeOutside snapshot={snapshot} now={before} online units="imperial" onPreview={vi.fn()}/>);
  await act(async () => generate());
  expect(screen.getByRole('button', { name: 'Preview this hour' })).toBeInTheDocument();
  vi.mocked(Date.now).mockReturnValue(after);
  rerender(<BestTimeOutside snapshot={snapshot} now={after} online units="imperial" onPreview={vi.fn()}/>);
  expect(screen.getByRole('button', { name: 'Preview this hour' })).toBeInTheDocument();
  expect(generateOutdoorRecommendation).toHaveBeenCalledTimes(1);
});

it('clears an expired result without waiting for the parent clock', async () => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={vi.fn()}/>);
  await act(async () => generate());
  expect(screen.getByRole('button', { name: 'Preview this hour' })).toBeInTheDocument();
  await act(async () => { await vi.advanceTimersByTimeAsync(900000); });
  expect(screen.queryByRole('button', { name: 'Preview this hour' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ask OpenAI' })).toBeInTheDocument();
});

it('rejects an expired preview click if a backgrounded tab has delayed its timers', async () => {
  const onPreview = vi.fn();
  render(<BestTimeOutside snapshot={outdoorSnapshot()} now={now} online units="imperial" onPreview={onPreview}/>);
  await act(async () => generate());
  vi.mocked(Date.now).mockReturnValue(now + 900001);
  fireEvent.click(screen.getByRole('button', { name: 'Preview this hour' }));
  expect(onPreview).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Preview this hour' })).not.toBeInTheDocument();
});
