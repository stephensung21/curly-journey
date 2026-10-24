import { act as rtlAct, fireEvent, render, screen } from '@testing-library/react-native';
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
// A tap on the track, measured against the outer view (the track fills it).
const press = (x: number) => fireEvent.press(screen.getByTestId('slider-track'), { nativeEvent: { locationX: x } });
/** A responder event whose single touch moved by (dx, dy) since it started at (x, 0). */
const touch = (x: number, dx: number, dy: number, ts: number) => ({
  nativeEvent: { locationX: x + dx },
  touchHistory: {
    touchBank: [{ touchActive: true, startPageX: x, startPageY: 0, startTimeStamp: 0, previousPageX: x, previousPageY: 0, previousTimeStamp: 0, currentPageX: x + dx, currentPageY: dy, currentTimeStamp: ts }],
    numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: ts,
  },
});
const handlers = () => screen.getByTestId('slider-pan').props;
/** As the responder system does: the capture pass updates the gesture, then the bubble pass decides. */
const moveClaims = (e: ReturnType<typeof touch>) => {
  handlers().onMoveShouldSetResponderCapture(e);
  return handlers().onMoveShouldSetResponder(e);
};

it('does not claim a touch on start, so a parent can scroll', async () => {
  await setup(50);
  expect(handlers().onStartShouldSetResponder(touch(0, 0, 0, 0))).toBe(false);
});

it('leaves vertical moves to the parent', async () => {
  await setup(50);
  expect(moveClaims(touch(100, 3, 30, 1))).toBe(false);
});

it('claims horizontal moves', async () => {
  await setup(50);
  expect(moveClaims(touch(100, 30, 3, 1))).toBe(true);
});

it('ignores tiny horizontal jitter', async () => {
  await setup(50);
  expect(moveClaims(touch(100, 3, 0, 1))).toBe(false);
});

it('puts the thumb under the finger when it claims a drag, then follows it', async () => {
  const onChange = await setup(0);
  await layout(222);
  // Finger went down at x = 111 and is at x = 161 (150 of 200 usable) when the slider claims it.
  await rtlAct(() => handlers().onResponderGrant(touch(111, 50, 0, 1)));
  expect(onChange).toHaveBeenLastCalledWith(75);
});

it('jumps to a tapped point', async () => {
  const onChange = await setup(0);
  await layout(222);
  await press(161); // 150 of 200 usable
  expect(onChange).toHaveBeenLastCalledWith(75);
});

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
