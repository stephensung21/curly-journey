import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import NetWorthScreen from '../app/networth';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const line = (key: string, name: string, valueCents: number, over: object = {}) => ({
  key, name, valueCents, accountIds: [Number(key.split(':')[1] ?? 0)], stale: false, ...over,
});
const response = {
  totalCents: 31_840_000, ownCents: 117_700_000, oweCents: -85_860_000,
  own: [
    line('acct:1', 'Home', 95_000_000),
    line('acct:2', 'AMP super', 6_200_000, { stale: true }),
    line('offsets', 'Offsets (2)', 7_674_000, { accountIds: [3, 4], members: [line('acct:3', 'Main', 5_000_000), line('acct:4', 'Savings', 2_674_000)] }),
  ],
  owe: [line('acct:5', 'Home loan', -85_629_000)],
  history: [
    { date: '2026-04-24', totalCents: 28_000_000 },
    { date: '2026-10-24', totalCents: 31_840_000 },
  ],
  since: { fromDate: '2026-09-24', deltaCents: 620_000 },
};
let data: object | undefined;
let isError = false;
const refetch = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  data = response;
  isError = false;
  (mocked.useAccounts as jest.Mock).mockReturnValue({
    data: { accounts: [
      { id: 2, kind: 'manual_asset', icon: '🧓' },
      { id: 5, kind: 'mortgage', icon: null },
    ] },
  });
  useSettings.setState({ hideBalances: false });
  (mocked.useNetWorth as jest.Mock).mockImplementation(() => ({ data, isError, refetch }));
});

it('shows total, note, tiles and lists', async () => {
  await renderScreen(<NetWorthScreen />);
  expect(screen.getByText('$318,400')).toBeTruthy();
  expect(screen.getByText(/up \$6,200 since Sep/)).toBeTruthy();
  expect(screen.getByText('You own')).toBeTruthy();
  expect(screen.getByText('You owe')).toBeTruthy();
  expect(screen.getByText('Home')).toBeTruthy();
  expect(screen.getByText('Home loan')).toBeTruthy();
  expect(screen.getByText('$1,177,000')).toBeTruthy();
});

it('says down when the delta is negative', async () => {
  data = { ...response, since: { fromDate: '2026-09-24', deltaCents: -150_000 } };
  await renderScreen(<NetWorthScreen />);
  expect(screen.getByText(/down \$1,500 since Sep/)).toBeTruthy();
});

it('expands the Offsets group', async () => {
  await renderScreen(<NetWorthScreen />);
  expect(screen.queryByText('Savings')).toBeNull();
  await fireEvent.press(screen.getByText('Offsets (2)'));
  expect(screen.getByText('Savings')).toBeTruthy();
});

it('shows update? only on stale lines', async () => {
  await renderScreen(<NetWorthScreen />);
  expect(screen.getAllByText('update?')).toHaveLength(1);
});

it('opens the account on tap', async () => {
  await renderScreen(<NetWorthScreen />);
  await fireEvent.press(screen.getByText('Home'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: '1' } });
});

it('defaults to 6M and refetches on range change', async () => {
  await renderScreen(<NetWorthScreen />);
  expect(mocked.useNetWorth).toHaveBeenLastCalledWith('6M');
  await fireEvent.press(screen.getByText('1Y'));
  expect(mocked.useNetWorth).toHaveBeenLastCalledWith('1Y');
});

it('masks totals, tiles, lines and axis labels when balances are hidden', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<NetWorthScreen />);
  expect(screen.queryByText(/318,400/)).toBeNull();
  expect(screen.queryByText(/950,000/)).toBeNull();
  expect(screen.queryByText(/1,177,000/)).toBeNull();
  // total + 2 tiles + 4 lines + 5 y labels (+ since amount) = at least 12
  expect(screen.getAllByText('$•••').length).toBeGreaterThanOrEqual(12);
});

it('single point shows the hand note', async () => {
  data = { ...response, history: [{ date: '2026-10-24', totalCents: 31_840_000 }], since: null };
  await renderScreen(<NetWorthScreen />);
  expect(screen.getByText('History starts today')).toBeTruthy();
});

it('empty history shows no note', async () => {
  data = { ...response, history: [], since: null };
  await renderScreen(<NetWorthScreen />);
  expect(screen.queryByText('History starts today')).toBeNull();
});

it('uses each account icon, with the kind emoji as fallback', async () => {
  await renderScreen(<NetWorthScreen />);
  expect(screen.getByText('🧓')).toBeTruthy();
  expect(screen.getByText('🏦')).toBeTruthy();
  expect(screen.getByText('🛟')).toBeTruthy();
});

it('shows each month label once on 1M', async () => {
  data = { ...response, history: [{ date: '2026-09-25', totalCents: 1_000_000 }, { date: '2026-10-10', totalCents: 1_100_000 }, { date: '2026-10-24', totalCents: 1_200_000 }] };
  await renderScreen(<NetWorthScreen />);
  expect(screen.getAllByText('Oct')).toHaveLength(1);
  expect(screen.getAllByText('Sep')).toHaveLength(1);
});

it('shows an error when the load fails', async () => {
  data = undefined;
  isError = true;
  await renderScreen(<NetWorthScreen />);
  expect(screen.getByText("Couldn't load net worth. Pull to try again.")).toBeTruthy();
});

it('shows nothing extra while loading', async () => {
  data = undefined;
  await renderScreen(<NetWorthScreen />);
  expect(screen.queryByText(/Couldn't load/)).toBeNull();
});
