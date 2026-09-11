import { beforeEach, expect, it, vi } from 'vitest';
import { asheville, forecastFixture } from '../test/fixtures';
import { normalizeWeather } from './weather';
const plugin = vi.hoisted(() => ({ update: vi.fn().mockResolvedValue(undefined), clear: vi.fn().mockResolvedValue(undefined), native: true }));
vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));
vi.mock('./native', () => ({ isNativeApp: () => plugin.native }));
import { syncWidget, widgetPayload } from './widget';
beforeEach(() => { plugin.native = true; plugin.update.mockClear(); plugin.clear.mockClear(); });
it('shares canonical forecast, selected units and matching regional landscape', () => {
  const weather = normalizeWeather(forecastFixture(), asheville);
  expect(widgetPayload(asheville, 'imperial', weather)).toMatchObject({ version: 1, place: asheville, units: 'imperial', weather, landscape: 'blue-ridge' });
});
it('serializes location changes and clear across bridge calls', async () => {
  const first = syncWidget(asheville, 'metric', null); const last = syncWidget(null, 'imperial', null); await Promise.all([first, last]);
  expect(JSON.parse(plugin.update.mock.calls[0][0].payload)).toMatchObject({ place: asheville, weather: null }); expect(plugin.clear).toHaveBeenCalledOnce();
  expect(plugin.update.mock.invocationCallOrder[0]).toBeLessThan(plugin.clear.mock.invocationCallOrder[0]);
});
it('never calls the native bridge in web builds', async () => {
  plugin.native = false; await syncWidget(asheville, 'metric', null); expect(plugin.update).not.toHaveBeenCalled();
});
