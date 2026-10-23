import { screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import CategoryScreen from '../app/category/[id]';
import * as hooks from '../src/api/hooks';

let mockParams: Record<string, string>;
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const full = { accountId: 7, merchant: '', categoryId: 1, categorySource: null, flow: 'normal', flowSource: 'auto', note: null, memo: null, feedCreatedAt: null, splits: [], status: 'posted', source: 'pocketsmith' };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '1', month: '2026-10', institution: 'Amex' };
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts: [{ id: 7, name: 'Everyday', displayName: 'Daily' }] } });
  (mocked.useCategories as jest.Mock).mockReturnValue({
    data: [{ id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 }],
  });
  (mocked.useTransactionsQuery as jest.Mock).mockReturnValue({
    data: {
      transactions: [
        { ...full, id: 1, date: '2026-10-22', amountCents: -4500, description: 'Woolies' },
        { ...full, id: 2, date: '2026-10-20', amountCents: -2500, description: 'Coles' },
        { ...full, id: 3, date: '2026-10-20', amountCents: -9900, description: 'Transfer thing', flow: 'transfer' },
      ],
      totalCents: 12345,
    },
    isLoading: false,
  });
});

it('queries by category, month and institution', async () => {
  await renderScreen(<CategoryScreen />);
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', categoryId: 1, institution: 'Amex' });
});

it("shows header and the server's total, which matches the Spending bar (split parts, excluded accounts)", async () => {
  await renderScreen(<CategoryScreen />);
  expect(screen.getByText('🛒 Groceries')).toBeTruthy();
  expect(screen.getByText('October 2026')).toBeTruthy();
  expect(screen.getByText('$123.45')).toBeTruthy();
  expect(screen.queryByText('$70.00')).toBeNull();
});

it('shows no total while loading', async () => {
  (mocked.useTransactionsQuery as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
  await renderScreen(<CategoryScreen />);
  expect(screen.getByText('🛒 Groceries')).toBeTruthy();
  expect(screen.queryByText('$0.00')).toBeNull();
});

it('groups rows by day', async () => {
  await renderScreen(<CategoryScreen />);
  expect(screen.getByText('Today · Thu 22 Oct')).toBeTruthy();
  expect(screen.getByText('Tue 20 Oct')).toBeTruthy();
  expect(screen.getByText('Woolies')).toBeTruthy();
  expect(screen.getByText('Coles')).toBeTruthy();
});

it('handles the uncategorised bucket', async () => {
  mockParams = { id: 'none', month: '2026-10' };
  await renderScreen(<CategoryScreen />);
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', categoryId: 'none' });
  expect(screen.getByText('? Uncategorised')).toBeTruthy();
});

it('scopes to an account and shows its name', async () => {
  mockParams = { id: '1', month: '2026-10', accountId: '7' };
  await renderScreen(<CategoryScreen />);
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', categoryId: 1, accountId: 7 });
  expect(screen.getByText('Daily')).toBeTruthy();
  expect(screen.getByText('October 2026')).toBeTruthy();
});

it('statement period passes through and shows the range', async () => {
  mockParams = { id: '1', month: '2026-10', accountId: '7', period: 'statement' };
  await renderScreen(<CategoryScreen />);
  expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', categoryId: 1, accountId: 7, period: 'statement' });
  expect(screen.getByText('26 Sep – 25 Oct')).toBeTruthy();
  expect(screen.queryByText('October 2026')).toBeNull();
});
