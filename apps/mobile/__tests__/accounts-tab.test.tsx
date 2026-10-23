import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountsScreen from '../app/(tabs)/index';
import { useSettings } from '../src/settings/store';
import * as hooks from '../src/api/hooks';

jest.mock('expo-router', () => ({ Link: ({ children }: { children: unknown }) => children }));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const base = {
  source: 'pocketsmith', name: 'n', displayName: null, balanceDate: null, countsSpending: true,
  countsNetWorth: true, projections: 'off', isOffset: false, stale: false, balanceCents: 123400,
};
const acct = (id: number, institution: string, over: object = {}) => ({ ...base, id, institution, kind: 'transaction', name: `${institution} acct`, ...over });

let accounts: object[];
let status: object;
const refetchAccounts = jest.fn();
const refetchStatus = jest.fn();
const mutateAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false, homeChart: 'sixMonths' });
  accounts = [
    acct(1, 'Up'),
    acct(2, 'Zed'),
    acct(3, 'CommSec', { kind: 'brokerage' }),
    acct(4, 'Amex', { kind: 'credit_card' }),
    acct(5, 'CommBank', { kind: 'mortgage', isOffset: true, displayName: 'Home loan', stale: false }),
  ];
  status = { lastSuccessAt: new Date(Date.now() - 3 * 86400000).toISOString(), lastStatus: 'ok', stale: false };
  mutateAsync.mockResolvedValue({});
  const setup = () => {
    (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts, lastSuccessAt: (status as any).lastSuccessAt }, refetch: refetchAccounts, isLoading: false }));
    (mocked.useSyncStatus as jest.Mock).mockImplementation(() => ({ data: status, refetch: refetchStatus }));
    (mocked.useSyncNow as jest.Mock).mockReturnValue({ mutateAsync });
    (mocked.useSpending as jest.Mock).mockReturnValue({ data: { totalCents: 248050 } });
    (mocked.useInOut as jest.Mock).mockReturnValue({
      data: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map(month => ({ month, inCents: 520000, mortgageCents: 310000, spendingCents: 248000 })),
    });
    (mocked.useDaily as jest.Mock).mockReturnValue({ data: [{ day: 1, inCents: 0, mortgageCents: 0, spendingCents: 1000 }] });
  };
  setup();
});

it('groups by institution in the fixed order', async () => {
  await renderScreen(<AccountsScreen />);
  const texts: string[] = [];
  const walk = (n: any): void => {
    if (typeof n === 'string') texts.push(n);
    else if (n) (Array.isArray(n) ? n : (n.children ?? [])).forEach(walk);
  };
  walk(screen.toJSON());
  const positions = ['CommBank', 'Amex', 'Up', 'CommSec', 'Zed'].map(n => texts.indexOf(n));
  expect(positions.every(p => p >= 0)).toBe(true);
  expect([...positions].sort((x, y) => x - y)).toEqual(positions);
});

it('shows the stale pill only on stale accounts', async () => {
  accounts[0] = acct(1, 'Up', { stale: true });
  await renderScreen(<AccountsScreen />);
  expect(screen.getAllByText(/synced 3 days ago/)).toHaveLength(1);
});

it('shows a banner when a spending account is stale', async () => {
  accounts[0] = acct(1, 'Up', { stale: true });
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText(/Up hasn't updated since/)).toBeTruthy();
  expect(screen.getByText('Check')).toBeTruthy();
});

it('no banner when only the mortgage is stale', async () => {
  accounts[4] = acct(5, 'CommBank', { kind: 'mortgage', countsSpending: false, stale: true });
  await renderScreen(<AccountsScreen />);
  expect(screen.queryByText(/hasn't updated/)).toBeNull();
  expect(screen.getByText(/synced 3 days ago/)).toBeTruthy();
});

it('banner says sync failed when last sync failed', async () => {
  status = { ...status, lastStatus: 'failed' };
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText('Sync failed ·')).toBeTruthy();
  expect(screen.getByText('Check')).toBeTruthy();
});

it('shows offset subline and displayName', async () => {
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText('Offset · home loan')).toBeTruthy();
  expect(screen.getByText('Home loan')).toBeTruthy();
});

it('hides every balance when Hide balances is on', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<AccountsScreen />);
  // 5 accounts + hero total + 5 chart y labels
  expect(screen.getAllByText('$•••')).toHaveLength(11);
  expect(screen.queryByText(/1,234/)).toBeNull();
});

it('shows the empty state', async () => {
  accounts = [];
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText('No accounts yet. Connect PocketSmith in the backend, then pull to refresh.')).toBeTruthy();
});

const pull = async () => {
  const scroll = screen.getByTestId('accounts-scroll');
  await act(async () => {
    await scroll.props.refreshControl.props.onRefresh();
  });
};

it('pull-to-refresh syncs then refetches', async () => {
  await renderScreen(<AccountsScreen />);
  await pull();
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(refetchAccounts).toHaveBeenCalled();
  expect(refetchStatus).toHaveBeenCalled();
});

it('shows inline error when sync fails', async () => {
  mutateAsync.mockRejectedValue(new Error('502'));
  await renderScreen(<AccountsScreen />);
  await pull();
  expect(await screen.findByText('Sync failed. Try again soon.')).toBeTruthy();
});

it('uses singular for one day', async () => {
  status = { ...status, lastSuccessAt: new Date(Date.now() - 86400000).toISOString() };
  accounts[0] = acct(1, 'Up', { stale: true });
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText('synced 1 day ago')).toBeTruthy();
});

it('banner falls back to "recently" when there is no last success', async () => {
  status = { lastSuccessAt: null, lastStatus: 'ok', stale: true };
  accounts[0] = acct(1, 'Up', { stale: true });
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText("Up hasn't updated recently")).toBeTruthy();
});

it('shows the hero spending total for this month', async () => {
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText("You've spent this month")).toBeTruthy();
  expect(screen.getByText('$2,480.50')).toBeTruthy();
  expect(mocked.useSpending).toHaveBeenCalledWith({ month: '2026-10' });
  expect(mocked.useInOut).toHaveBeenCalledWith('2026-10', 6);
});

it('uses the daily chart when homeChart is thisMonth', async () => {
  useSettings.setState({ homeChart: 'thisMonth' });
  await renderScreen(<AccountsScreen />);
  expect(mocked.useDaily).toHaveBeenCalledWith('2026-10');
  expect(screen.getByText('31')).toBeTruthy();
});

it('Refresh button syncs once, shows Syncing…, ignores a second press', async () => {
  let resolve!: (v: object) => void;
  mutateAsync.mockReturnValue(new Promise(r => (resolve = r)));
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByLabelText('Refresh'));
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Syncing…')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Refresh'));
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({});
  });
  expect(refetchAccounts).toHaveBeenCalled();
  expect(screen.queryByText('Syncing…')).toBeNull();
});

it('Refresh button shows the error when sync rejects', async () => {
  mutateAsync.mockRejectedValue(new Error('502'));
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByLabelText('Refresh'));
  expect(await screen.findByText('Sync failed. Try again soon.')).toBeTruthy();
});
