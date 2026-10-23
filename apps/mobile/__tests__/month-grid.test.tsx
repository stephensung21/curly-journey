import { fireEvent, render, screen } from '@testing-library/react-native';
import { MonthGrid } from '../src/components/MonthGrid';

it('starts October 2026 on Thursday, Monday-first, highlighting today', async () => {
  await render(<MonthGrid month="2026-10" today="2026-10-24" dots={{}} />);
  // 3 leading blanks (Mon-Wed), then 31 days: 34 cells padded to 35 with 1 trailing blank.
  expect(screen.getAllByTestId('grid-blank')).toHaveLength(4);
  expect(screen.getByTestId('grid-today')).toBeTruthy();
  expect(screen.getAllByText('M')).toHaveLength(1);
  expect(screen.getAllByText('T')).toHaveLength(2);
});

it('onSelect makes days pressable buttons labelled with the day', async () => {
  const onSelect = jest.fn();
  await render(<MonthGrid month="2026-10" today="2026-10-24" dots={{}} onSelect={onSelect} />);
  await fireEvent.press(screen.getByLabelText('Tue 27 Oct'));
  expect(onSelect).toHaveBeenCalledWith('2026-10-27');
});

it('is not pressable without onSelect', async () => {
  await render(<MonthGrid month="2026-10" today="2026-10-24" dots={{}} />);
  expect(screen.queryByLabelText('Tue 27 Oct')).toBeNull();
});
