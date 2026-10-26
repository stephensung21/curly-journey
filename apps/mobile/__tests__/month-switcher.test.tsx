import { fireEvent, render, screen } from '@testing-library/react-native';
import { MonthSwitcher } from '../src/components/MonthSwitcher';

jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));

it('tapping the month opens a month grid for that year', async () => {
  await render(<MonthSwitcher value="2026-04" onChange={jest.fn()} />);
  expect(screen.queryByLabelText('Pick Jan 2026')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Choose month, April 2026'));
  expect(screen.getByText('2026')).toBeTruthy();
  expect(screen.getByLabelText('Pick Jan 2026')).toBeTruthy();
  expect(screen.getByLabelText('Pick Dec 2026')).toBeTruthy();
});

it('picking a month calls onChange and closes the grid', async () => {
  const onChange = jest.fn();
  await render(<MonthSwitcher value="2026-04" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Choose month, April 2026'));
  await fireEvent.press(screen.getByLabelText('Previous year'));
  await fireEvent.press(screen.getByLabelText('Pick Sep 2025'));
  expect(onChange).toHaveBeenCalledWith('2025-09');
  expect(screen.queryByLabelText('Pick Sep 2025')).toBeNull();
});

it('next year steps forward, and the arrows still step one month', async () => {
  const onChange = jest.fn();
  await render(<MonthSwitcher value="2026-01" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(onChange).toHaveBeenCalledWith('2025-12');
  await fireEvent.press(screen.getByLabelText('Choose month, January 2026'));
  await fireEvent.press(screen.getByLabelText('Next year'));
  expect(screen.getByLabelText('Pick Mar 2027')).toBeTruthy();
});

it('marks the current month in the grid', async () => {
  await render(<MonthSwitcher value="2026-04" onChange={jest.fn()} />);
  await fireEvent.press(screen.getByLabelText('Choose month, April 2026'));
  expect(screen.getByLabelText('Pick Oct 2026, this month')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Previous year'));
  expect(screen.queryByLabelText(/^Pick .*, this month$/)).toBeNull();
});

it('shows a This month button away from the current month, which jumps back', async () => {
  const onChange = jest.fn();
  const { rerender } = await render(<MonthSwitcher value="2026-04" onChange={onChange} />);
  await fireEvent.press(screen.getByLabelText('Back to this month'));
  expect(onChange).toHaveBeenCalledWith('2026-10');
  await rerender(<MonthSwitcher value="2026-10" onChange={onChange} />);
  expect(screen.queryByLabelText('Back to this month')).toBeNull();
});
