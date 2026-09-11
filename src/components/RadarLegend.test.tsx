import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RadarLegend } from './RadarLegend';

describe('radar legend', () => {
  it('switches from an accessible intensity scale to a fully visible type key', () => {
    const { rerender } = render(<RadarLegend layer="intensity"/>);
    expect(screen.getByRole('img', { name: /minus 20 to 70 dBZ/ })).toBeInTheDocument();
    expect(screen.getByText('Weaker echoes')).toBeVisible();
    expect(screen.getByText('Stronger echoes')).toBeVisible();
    rerender(<RadarLegend layer="type"/>);
    const legend = screen.getByRole('region', { name: 'Precipitation type' });
    expect(screen.queryByRole('img', { name: /dBZ/ })).not.toBeInTheDocument();
    expect(within(legend).getAllByRole('term')).toHaveLength(7);
    for (const label of ['Warm stratiform rain', 'Snow', 'Convective rain', 'Hail', 'Cool stratiform rain', 'Tropical stratiform rain', 'Tropical convective rain']) {
      expect(within(legend).getByText(label, { exact: true })).toBeVisible();
    }
    expect(within(legend).getByText(/Sleet and freezing rain are not identified separately/)).toBeVisible();
    expect(within(legend).getByText(/Blank areas may have no radar data/)).toBeVisible();
  });
});
