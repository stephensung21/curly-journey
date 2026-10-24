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

const layout = (w: number) => fireEvent(screen.getByLabelText('Spare cash'), 'layout', { nativeEvent: { layout: { width: w, height: 36, x: 0, y: 0 } } });
const press = (x: number) =>
  fireEvent(screen.getByLabelText('Spare cash'), 'responderGrant', { nativeEvent: { locationX: x }, touchHistory: { touchBank: [{ touchActive: true, currentPageX: 0, currentPageY: 0, previousPageX: 0, previousPageY: 0, currentTimeStamp: 0, previousTimeStamp: 0, startPageX: 0, startPageY: 0, startTimeStamp: 0 }], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: 0 } });

it('maps a press on the outer view to a value over the usable width', async () => {
  const onChange = await setup(0);
  await layout(222); // usable width 200 (thumb is 22)
  await press(111); // thumb centre at the middle
  expect(onChange).toHaveBeenLastCalledWith(50);
  await press(11);
  expect(onChange).not.toHaveBeenCalledWith(1);
});

it('reaches both ends under the finger', async () => {
  const onChange = await setup(50);
  await layout(222);
  await press(211);
  expect(onChange).toHaveBeenLastCalledWith(100);
  await press(0);
  expect(onChange).toHaveBeenLastCalledWith(0);
});

it('keeps fractional steps clean', async () => {
  const onChange = jest.fn();
  await render(<Slider label="Rate" accessibilityLabel="Rate" value={0.2} min={0} max={1} step={0.1} onChange={onChange} format={v => <Text>{String(v)}</Text>} />);
  fireEvent(screen.getByLabelText('Rate'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(onChange).toHaveBeenLastCalledWith(0.3);
});
