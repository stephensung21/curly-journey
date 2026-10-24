import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Slider } from '../src/components/Slider';
import { Amount } from '../src/components/Amount';
import { useSettings } from '../src/settings/store';

const act = async (name: string) => fireEvent(screen.getByLabelText('Spare cash'), 'accessibilityAction', { nativeEvent: { actionName: name } });

async function setup(value: number, onChange = jest.fn()) {
  await render(
    <Slider label="Spare cash" accessibilityLabel="Spare cash" value={value} min={0} max={100} step={25} onChange={onChange} format={v => <Amount cents={v * 100} />} />,
  );
  return onChange;
}

beforeEach(() => useSettings.setState({ hideBalances: false }));

it('is adjustable and shows the formatted value', async () => {
  await setup(50);
  expect(screen.getByLabelText('Spare cash').props.accessibilityRole).toBe('adjustable');
  expect(screen.getByText('$50.00')).toBeTruthy();
  expect(screen.getByText('Spare cash')).toBeTruthy();
});

it('moves by one step', async () => {
  const onChange = await setup(50);
  await act('increment');
  expect(onChange).toHaveBeenLastCalledWith(75);
  await act('decrement');
  expect(onChange).toHaveBeenLastCalledWith(25);
});

it('clamps to max', async () => {
  const onChange = await setup(90);
  await act('increment');
  expect(onChange).toHaveBeenLastCalledWith(100);
});

it('clamps to min', async () => {
  const onChange = await setup(10);
  await act('decrement');
  expect(onChange).toHaveBeenLastCalledWith(0);
});

it('masks dollar labels when balances are hidden', async () => {
  useSettings.setState({ hideBalances: true });
  await setup(50);
  expect(screen.queryByText('$50.00')).toBeNull();
});

it('renders any node from format', async () => {
  await render(<Slider label="Age" accessibilityLabel="Age" value={60} min={40} max={70} step={1} onChange={jest.fn()} format={v => <Text>{`${v} years`}</Text>} />);
  expect(screen.getByText('60 years')).toBeTruthy();
});
