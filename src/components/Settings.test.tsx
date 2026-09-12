import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { defaultPreferences } from '../lib/storage';
import Settings from './Settings';

vi.mock('../hooks/useAppleAvailability', () => ({ useAppleAvailability: () => null }));

it('keeps confirmation focus on the safe choice and restores its trigger on cancellation', () => {
  const onClear = vi.fn();
  const outside = document.createElement('button');
  document.body.append(outside);
  outside.focus();
  render(<Settings preferences={defaultPreferences('en-US')} onChange={vi.fn()} systemReduced={false} onClear={onClear}
    audio={{ enabled: false, playing: false, toggle: vi.fn(), stop: vi.fn(), effect: vi.fn(), error: null, trackName: 'Test' }}
    install={{ native: false, installed: false, canPrompt: false, showHelp: false, setShowHelp: vi.fn(), ios: false, install: vi.fn(), error: null }}/>);

  expect(outside).toHaveFocus();
  const trigger = screen.getByRole('button', { name: 'Clear saved data' });
  trigger.focus();
  fireEvent.click(trigger);
  const keep = screen.getByRole('button', { name: 'Keep my data' });
  expect(keep).toHaveFocus();
  expect(keep).toHaveAccessibleDescription('Clear saved places, forecasts, briefings, and settings from this device?');
  expect(onClear).not.toHaveBeenCalled();

  fireEvent.click(keep);
  expect(screen.getByRole('button', { name: 'Clear saved data' })).toHaveFocus();
  expect(onClear).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Clear saved data' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear everything' }));
  expect(onClear).toHaveBeenCalledOnce();
  outside.remove();
});
