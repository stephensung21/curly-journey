import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import GoalsScreen from '../app/goals';
import * as hooks from '../src/api/hooks';
import { monthEnd } from '../src/components/GoalSheet';
import { useSettings } from '../src/settings/store';
import { renderScreen } from '../test-utils/renderScreen';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-26T02:00:00Z') }));
jest.mock('../src/api/hooks');
jest.spyOn(Alert, 'alert');

const mocked = hooks as jest.Mocked<typeof hooks>;
const goal = {
  id: 4, name: 'Japan', emoji: '✈️', targetCents: 1_000_000, targetDate: '2027-10-31', accountIds: [2],
  currentCents: 800_000, percent: 80, remainingCents: 200_000, monthsLeft: 12, monthlyNeededCents: 16_667, reached: false,
};
const fi = { yearlySpendingCents: 4_000_000, fiNumberCents: 100_000_000, investedCents: 25_000_000, percent: 25 };
const create = jest.fn();
const update = jest.fn();
const del = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false });
  create.mockResolvedValue({});
  update.mockResolvedValue({});
  del.mockResolvedValue(undefined);
  (mocked.useGoals as jest.Mock).mockReturnValue({ data: { goals: [goal], fi }, isLoading: false });
  (mocked.useAccounts as jest.Mock).mockReturnValue({
    data: { accounts: [{ id: 2, name: 'Savings', displayName: 'Holiday', countsNetWorth: true }, { id: 3, name: 'Old', displayName: null, countsNetWorth: false }] },
  });
  (mocked.useCreateGoal as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false });
  (mocked.useUpdateGoal as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false });
  (mocked.useDeleteGoal as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
});

it('shows the FI number and each goal with progress and the monthly amount', async () => {
  await renderScreen(<GoalsScreen />);
  expect(screen.getByText('$1,000,000')).toBeTruthy();
  expect(screen.getByText('· 25% there')).toBeTruthy();
  expect(screen.getByText('Japan')).toBeTruthy();
  expect(screen.getByText('Holiday')).toBeTruthy();
  expect(screen.getByText('80%')).toBeTruthy();
  expect(screen.getByText('$167')).toBeTruthy();
  expect(screen.getByText('a month to reach it by October 2027')).toBeTruthy();
});

it('creates a goal tracking net worth by a month', async () => {
  await renderScreen(<GoalsScreen />);
  await fireEvent.press(screen.getByText('+ New goal'));
  await fireEvent.changeText(screen.getByLabelText('Goal name'), ' House ');
  await fireEvent.changeText(screen.getByLabelText('Goal target'), '150000');
  await fireEvent(screen.getByLabelText('By a date'), 'valueChange', true);
  await fireEvent.press(screen.getByLabelText('Next month'));
  await fireEvent.press(screen.getByText('Save'));
  expect(create).toHaveBeenCalledWith({ name: 'House', emoji: '🎯', targetCents: 15_000_000, targetDate: '2026-11-30', accountIds: [] });
});

it('needs a name and a target', async () => {
  await renderScreen(<GoalsScreen />);
  await fireEvent.press(screen.getByText('+ New goal'));
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Give it a name')).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText('Goal name'), 'Car');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Enter a target above $0')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it('edits a goal and deletes after asking', async () => {
  await renderScreen(<GoalsScreen />);
  await fireEvent.press(screen.getByLabelText('Goal Japan'));
  expect(screen.getByLabelText('Goal target').props.value).toBe('10000');
  await fireEvent.press(screen.getByText('Net worth'));
  await fireEvent.press(screen.getByText('Save'));
  expect(update).toHaveBeenCalledWith({ id: 4, name: 'Japan', emoji: '✈️', targetCents: 1_000_000, targetDate: '2027-10-31', accountIds: [] });
  await fireEvent.press(screen.getByLabelText('Goal Japan'));
  await fireEvent.press(screen.getByText('Delete goal'));
  const buttons = (Alert.alert as jest.Mock).mock.calls.at(-1)![2] as { text: string; onPress?: () => void }[];
  buttons.find(b => b.text === 'Delete')!.onPress!();
  expect(del).toHaveBeenCalledWith(4);
});

it('hide balances hides the target while editing and keeps it unless retyped', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<GoalsScreen />);
  await fireEvent.press(screen.getByLabelText('Goal Japan'));
  expect(screen.getByLabelText('Goal target').props.value).toBe('');
  await fireEvent.press(screen.getByText('Save'));
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ targetCents: 1_000_000 }));
});

it('monthEnd is the last day of the month', () => {
  expect(monthEnd('2028-02')).toBe('2028-02-29');
  expect(monthEnd('2027-04')).toBe('2027-04-30');
});
