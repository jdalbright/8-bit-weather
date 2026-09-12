import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { WeatherBriefing } from './WeatherBriefing';
import { useBriefing } from '../hooks/useBriefing';
import { BRIEFING_TTL, BRIEFING_VERSION } from '../lib/briefing';
import { APPLE_BRIEFING_REVISION } from '../lib/apple-briefing';
import { normalizeWeather } from '../lib/weather';
import { asheville, fixtureTime, forecastFixture } from '../test/fixtures';

vi.mock('../hooks/useBriefing', () => ({ useBriefing: vi.fn() }));

it.each(['apple', 'openai'] as const)('identifies an expired offline %s briefing as saved with its original generation time', provider => {
  const snapshot = normalizeWeather(forecastFixture(), asheville, fixtureTime);
  const now = fixtureTime + 2 * 3600000;
  vi.mocked(useBriefing).mockReturnValue({
    briefing: {
      text: 'Temperatures stay mild this morning. Precipitation chances remain low.', provider,
      ...(provider === 'apple' ? { appleModelOSMajor: 27, applePromptRevision: APPLE_BRIEFING_REVISION } : {}),
      generatedAt: fixtureTime, windowStart: fixtureTime, windowEnd: fixtureTime + 86400000,
      expiresAt: fixtureTime + BRIEFING_TTL, version: BRIEFING_VERSION,
    },
    loading: false, eligible: false, error: undefined, retry: vi.fn(), canRetry: false,
    alternative: provider === 'apple' ? 'openai' : 'apple', canSwitch: false,
  });

  render(<WeatherBriefing snapshot={snapshot} units="imperial" online={false} now={now} provider={provider}/>);

  expect(screen.getByText('Temperatures stay mild this morning. Precipitation chances remain low.')).toBeInTheDocument();
  expect(screen.getByText('Saved briefing · Sep 7, 10:00 AM')).toBeInTheDocument();
  expect(screen.queryByText(/Next 24 hours/)).not.toBeInTheDocument();
});
