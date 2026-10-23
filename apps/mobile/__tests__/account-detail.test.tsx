import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountDetail from '../app/account/[id]';
import AccountsScreen from '../app/(tabs)/index';
import * as hooks from '../src/api/hooks';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { Pressable } = require('react-native');
  return {
    useLocalSearchParams: () => ({ id: '7' }),
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    Link: ({ children, href }: any) => (
      <Pressable onPress={() => mockPush(href)}>{children}</Pressable>
    ),
  };
});
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const account = {
  id: 7, source: 'pocketsmith', institution: 'CommBank', name: 'Everyday', displayName: null, kind: 'transaction',
  balanceCents: 123400, balanceDate: null, countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false,
};
let accounts: object[];
let txns: object[];
const full = { accountId: 7, merchant: "", categoryId: null, categorySource: null, flow: "normal", flowSource: "auto", note: null, memo: null, feedCreatedAt: null, splits: [] };

beforeEach(() => {
  jest.clearAllMocks();
  accounts = [account];
  txns = [
    { ...full, id: 1, date: '2026-10-22', amountCents: -450, description: 'Coffee', status: 'posted', source: 'pocketsmith' },
    { ...full, id: 2, date: '2026-10-20', amountCents: 500000, description: 'Salary', status: 'pending', source: 'pocketsmith' },
  ];
  (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts, lastSuccessAt: '2026-10-21T20:40:00Z' }, isLoading: false }));
  (mocked.useTransactions as jest.Mock).mockImplementation(() => ({ data: { transactions: txns }, isLoading: false }));
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: [] });
});

it('groups transactions by Sydney day', async () => {
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('Today · Thu 22 Oct')).toBeTruthy();
  expect(screen.getByText('Tue 20 Oct')).toBeTruthy();
  expect(screen.getByText('synced 7:40am')).toBeTruthy();
});

it('shows Yesterday header', async () => {
  txns = [{ ...full, id: 3, date: '2026-10-21', amountCents: -100, description: 'x', status: 'posted', source: 'csv' }];
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('Yesterday · Wed 21 Oct')).toBeTruthy();
});

it('shows Pending on pending rows', async () => {
  await renderScreen(<AccountDetail />);
  expect(screen.getAllByText(/Pending/)).toHaveLength(1);
});

it('requests the previous month when switching', async () => {
  await renderScreen(<AccountDetail />);
  expect(mocked.useTransactions).toHaveBeenLastCalledWith(7, '2026-10');
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(mocked.useTransactions).toHaveBeenLastCalledWith(7, '2026-09');
});

it('shows offset badge', async () => {
  accounts = [{ ...account, isOffset: true }];
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('Offset · home loan')).toBeTruthy();
});

it('settings button navigates to settings', async () => {
  await renderScreen(<AccountDetail />);
  await fireEvent.press(screen.getByLabelText('Account settings'));
  expect(mockPush).toHaveBeenCalledWith('/account/7/settings');
});

it('account row on the Accounts tab links to detail', async () => {
  (mocked.useSyncStatus as jest.Mock).mockReturnValue({ data: { lastSuccessAt: null, lastStatus: 'ok', stale: false }, refetch: jest.fn() });
  (mocked.useSyncNow as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Everyday'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: '7' } });
});

it('shows a load error instead of the empty state when transactions fail', async () => {
  (mocked.useTransactions as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: false, isError: true }));
  await renderScreen(<AccountDetail />);
  expect(screen.getByText("Couldn't load transactions. Pull to try again.")).toBeTruthy();
  expect(screen.queryByText('No transactions this month.')).toBeNull();
});
