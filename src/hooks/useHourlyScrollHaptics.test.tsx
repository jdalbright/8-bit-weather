import { act, fireEvent, render } from '@testing-library/react';
import { useRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useHourlyScrollHaptics } from './useHourlyScrollHaptics';
const mock = vi.hoisted(() => ({ native: true, pulse: vi.fn() }));
vi.mock('../lib/native', () => ({ isNativeApp: () => mock.native }));
vi.mock('../lib/native-experience', () => ({ triggerHaptic: mock.pulse }));
function Rail({ identity = 'a' }) {
  const ref = useRef<HTMLDivElement>(null);
  const begin = useHourlyScrollHaptics(ref, identity);
  return <><button onClick={begin}>Forward</button><div ref={ref} data-testid="rail"><div>Hour</div></div></>;
}
beforeEach(() => { vi.useFakeTimers(); mock.native = true; mock.pulse.mockClear(); });
it('ticks at tile boundaries, includes momentum, and ignores idle/programmatic scrolling', () => {
  const { getByTestId, getByText, rerender, unmount } = render(<Rail/>);
  const rail = getByTestId('rail');
  vi.spyOn(rail.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ width: 80 } as DOMRect);
  const scroll = (left: number) => { rail.scrollLeft = left; fireEvent.scroll(rail); };
  scroll(80); expect(mock.pulse).not.toHaveBeenCalled();
  fireEvent.pointerDown(rail);
  scroll(100); expect(mock.pulse).not.toHaveBeenCalled();
  scroll(125); expect(mock.pulse).toHaveBeenCalledTimes(1);
  scroll(135); expect(mock.pulse).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(100));
  scroll(210); expect(mock.pulse).toHaveBeenCalledTimes(2);
  expect(mock.pulse).toHaveBeenLastCalledWith('selection', true);
  act(() => vi.advanceTimersByTime(201));
  scroll(300); expect(mock.pulse).toHaveBeenCalledTimes(2);
  fireEvent.click(getByText('Forward')); scroll(380);
  expect(mock.pulse).toHaveBeenCalledTimes(3);
  rerender(<Rail identity="b"/>); scroll(460);
  expect(mock.pulse).toHaveBeenCalledTimes(3);
  unmount(); expect(vi.getTimerCount()).toBe(0);
});
it('does not attach haptic behavior on the website', () => {
  mock.native = false;
  const { getByTestId, getByText } = render(<Rail/>);
  const rail = getByTestId('rail');
  vi.spyOn(rail.firstElementChild!, 'getBoundingClientRect').mockReturnValue({ width: 80 } as DOMRect);
  fireEvent.click(getByText('Forward')); fireEvent.pointerDown(rail); rail.scrollLeft = 240; fireEvent.scroll(rail);
  expect(mock.pulse).not.toHaveBeenCalled();
});
