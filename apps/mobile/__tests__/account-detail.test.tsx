import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountDetail from '../app/account/[id]';
import AccountsScreen from '../app/(tabs)/index';
import { useSettings } from '../src/settings/store';
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
let spending: object | undefined;
const full = { accountId: 7, merchant: "", categoryId: null, categorySource: null, flow: "normal", flowSource: "auto", note: null, memo: null, feedCreatedAt: null, splits: [] };

beforeEach(() => {
  jest.clearAllMocks();
  spending = {
    totalCents: 8420, prevTotalCents: 5000, byCategory: [{ categoryId: 3, cents: 8420 }], byInstitution: [], notCounted: [],
    uncategorisedCount: 0, from: '2026-10-01', to: '2026-10-31',
  };
  accounts = [account];
  txns = [
    { ...full, id: 1, date: '2026-10-22', amountCents: -450, description: 'Coffee', status: 'posted', source: 'pocketsmith' },
    { ...full, id: 2, date: '2026-10-20', amountCents: 500000, description: 'Salary', status: 'pending', source: 'pocketsmith' },
  ];
  (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts, lastSuccessAt: '2026-10-21T20:40:00Z' }, isLoading: false }));
  (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: { transactions: txns }, isLoading: false }));
  (mocked.useSpending as jest.Mock).mockImplementation(() => ({ data: spending, isLoading: false }));
  useSettings.setState({ hideBalances: false });
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: [{ id: 3, name: 'Groceries', emoji: 'G', color: 'lime', kind: 'spending' }] });
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
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', accountId: 7 });
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-09', accountId: 7 });
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
(mocked.useSpending as jest.Mock).mockReturnValue({ data: { totalCents: 0 } });  (mocked.useInOut as jest.Mock).mockReturnValue({ data: [] });  (mocked.useDaily as jest.Mock).mockReturnValue({ data: [] });
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Everyday'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: '7' } });
});

it('shows a load error instead of the empty state when transactions fail', async () => {
  (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: false, isError: true }));
  await renderScreen(<AccountDetail />);
  expect(screen.getByText("Couldn't load transactions. Pull to try again.")).toBeTruthy();
  expect(screen.queryByText('No transactions this month.')).toBeNull();
});

const amex = { ...account, institution: 'American Express' };
const flows = () => [
  { ...full, id: 11, date: '2026-10-02', amountCents: 500000, description: 'Pay', status: 'posted', source: 'csv' },
  { ...full, id: 12, date: '2026-10-03', amountCents: -8420, description: 'Shop', status: 'posted', source: 'csv' },
  { ...full, id: 13, date: '2026-10-04', amountCents: -50000, description: 'Move', flow: 'transfer', status: 'posted', source: 'csv' },
];

it('hides the Statement option on non-Amex accounts', async () => {
  await renderScreen(<AccountDetail />);
  expect(screen.queryByText('Statement')).toBeNull();
});

it('Amex: Statement queries with period and shows the range', async () => {
  accounts = [amex];
  await renderScreen(<AccountDetail />);
  expect(screen.queryByText('26 Sep – 25 Oct')).toBeNull();
  await fireEvent.press(screen.getByText('Statement'));
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', accountId: 7, period: 'statement' });
  expect(mocked.useSpending).toHaveBeenLastCalledWith({ month: '2026-10', accountId: 7, period: 'statement' });
  expect(screen.getByText('26 Sep – 25 Oct')).toBeTruthy();
});

it('Categories tab shows the bars and drills down', async () => {
  await renderScreen(<AccountDetail />);
  await fireEvent.press(screen.getByText('Categories'));
  await fireEvent.press(screen.getByText('Groceries'));
  expect(mockPush).toHaveBeenCalledWith('/category/3?month=2026-10&accountId=7');
});

it('Categories page says so when there is no spending', async () => {
  spending = { ...(spending as object), totalCents: 0, byCategory: [] };
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('No spending this month.')).toBeTruthy();
});

it('shows the spent total and the more/less note', async () => {
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('Spent')).toBeTruthy();
  expect(screen.getAllByText('$84.20').length).toBeGreaterThan(0);
  expect(screen.getByText(/more than Sep/)).toBeTruthy();
});

it('shows In, Out and Change tiles and updates with the month', async () => {
  txns = flows();
  await renderScreen(<AccountDetail />);
  expect(screen.getByText('In')).toBeTruthy();
  expect(screen.getByText('Out')).toBeTruthy();
  expect(screen.getByText('Change')).toBeTruthy();
  expect(screen.getAllByText('+$5,000.00')).toHaveLength(2); // tile + the Pay row
  expect(screen.getByText('−$584.20')).toBeTruthy();
  expect(screen.getByText('+$4,415.80')).toBeTruthy();
  txns = [{ ...full, id: 21, date: '2026-09-02', amountCents: -1000, description: 'Old', status: 'posted', source: 'csv' }];
  await fireEvent.press(screen.getByLabelText('Previous month'));
  expect(screen.getAllByText('−$10.00')).toHaveLength(3);
  expect(screen.getByText('$0.00')).toBeTruthy();
});

it('masks the tiles when balances are hidden', async () => {
  txns = flows();
  useSettings.setState({ hideBalances: true });
  await renderScreen(<AccountDetail />);
  expect(screen.queryByText('+$5,000.00')).toBeNull();
  expect(screen.queryByText('−$584.20')).toBeNull();
  expect(screen.queryByText('+$4,415.80')).toBeNull();
});

it('shows no tile figures while loading', async () => {
  (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: true }));
  await renderScreen(<AccountDetail />);
  expect(screen.queryByText('In')).toBeNull();
  expect(screen.queryByText('$0.00')).toBeNull();
});

it('Amex Statement category bar drills down with the statement period', async () => {
  accounts = [amex];
  await renderScreen(<AccountDetail />);
  await fireEvent.press(screen.getByText('Statement'));
  await fireEvent.press(screen.getByText('Groceries'));
  expect(mockPush).toHaveBeenCalledWith('/category/3?month=2026-10&accountId=7&period=statement');
});

it('swiping the pager selects the Categories tab', async () => {
  await renderScreen(<AccountDetail />);
  const tab = () => screen.getByRole('button', { name: 'Categories' });
  expect(tab().props.accessibilityState.selected).toBe(false);
  const { Dimensions } = require('react-native');
  const width = Dimensions.get('window').width - 32;
  await fireEvent(screen.getByTestId('account-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: width } } });
  expect(tab().props.accessibilityState.selected).toBe(true);
});
