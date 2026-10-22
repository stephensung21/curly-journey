import { fireEvent, render, screen } from '@testing-library/react-native';
import { HeroCard } from '../src/components/HeroCard';
import { MonthSwitcher } from '../src/components/MonthSwitcher';

it('HeroCard has the signature corner', async () => {
  await render(<HeroCard testID="h" />);
  expect(screen.getByTestId('h')).toHaveStyle({
    borderBottomLeftRadius: 6,
    borderTopLeftRadius: 26,
    backgroundColor: '#ff7a45',
  });
});

it('MonthSwitcher steps months', async () => {
  const onChange = jest.fn();
  await render(<MonthSwitcher value="2026-01" onChange={onChange} />);
  expect(screen.getByText('January 2026')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Previous month'));
  expect(onChange).toHaveBeenCalledWith('2025-12');
});
