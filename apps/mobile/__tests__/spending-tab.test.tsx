import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { renderScreen } from '../test-utils/renderScreen';
import SpendingScreen from '../app/(tabs)/spending';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
let summary: object;
let limits: object[];
const txn = (over: object) => ({
  id: 1, accountId: 1, date: '2026-10-05', amountCents: -4550, description: 'WOOLWORTHS 1234', merchant: 'Woolworths', status: 'posted',
  source: 'pocketsmith', categoryId: 1, categorySource: 'auto', flow: 'normal', flowSource: 'auto', note: null, memo: null,
  feedCreatedAt: null, splits: [], ...over,
});
const txns = [
  txn({ id: 1 }),
  txn({ id: 2, date: '2026-10-03', merchant: '', description: 'SALARY ACME', amountCents: 500000, categoryId: null, flow: 'not_spending' }),
  txn({ id: 3, date: '2026-10-04', merchant: '', description: 'TRANSFER TO SAVINGS', amountCents: -50000, categoryId: null, flow: 'transfer' }),
];
const base = {
  totalCents: 120000,
  outCents: 150000,
  backCents: 30000,
  cardPaymentCents: 200000,
  prevMortgageCents: 0,
  prevCardPaymentCents: 100000,
  moneyInCents: 0,
  mortgageCents: 0,
  byCategory: [
    { categoryId: 1, cents: 60000, count: 5 },
    { categoryId: 2, cents: 30000, count: 3 },
    { categoryId: null, cents: 30000, count: 3 },
  ],
  byInstitution: [
    { institution: 'CommBank', cents: 70000 },
    { institution: 'Amex', cents: 50000 },
  ],
  notCounted: [
    { flow: 'transfer', cents: 250000, count: 4 },
    { flow: 'mortgage', cents: 0, count: 0 },
    { flow: 'not_spending', cents: 5000, count: 1 },
  ],
  uncategorisedCount: 3,
  from: '2026-10-01',
  to: '2026-10-31',
  prevTotalCents: 89000,
};

beforeEach(() => {
  jest.clearAllMocks();
  // The categorise-by-name and edit-category sheets are mounted (hidden) on this screen.
  (mocked.useCreateRule as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useRulePreview as jest.Mock).mockReturnValue({ data: undefined });
  (mocked.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useReorderCategories as jest.Mock).mockReturnValue({ mutate: jest.fn() });
  (mocked.useUpdateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useMergeCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useDeleteCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  summary = base;
  useSettings.setState({ spendingIncludesPayments: false });
  limits = [];
  (mocked.useLimits as jest.Mock).mockImplementation(() => ({ data: { limits } }));
  (mocked.useSpending as jest.Mock).mockImplementation(() => ({ data: summary, isLoading: false, refetch: jest.fn() }));
  (mocked.useSyncNow as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts: [{ id: 1, institution: 'CommBank' }], lastSuccessAt: null } });
  (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: { transactions: txns }, isLoading: false, isError: false, refetch: jest.fn() }));
  (mocked.useCategories as jest.Mock).mockReturnValue({
    data: [
      { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 },
      { id: 2, name: 'Dining out', emoji: '🍜', color: 'orange', kind: 'spending', sort: 2 },
    ],
  });
});

it('shows the total and a pink more-than note', async () => {
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('$1,200.00')).toBeTruthy();
  expect(screen.getByText('$310 more than Sep')).toBeTruthy();
});

it('shows income as money in, and money out, leaving out mortgage and Amex payments', async () => {
  summary = { ...base, mortgageCents: 300000, moneyInCents: 800000 };
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('Money in $8,000 · Money out $1,500')).toBeTruthy();
  expect(screen.getByText('Spending is money out less $300 of refunds and paybacks. Mortgage and Amex payments not included.')).toBeTruthy();
});

it('leaves the refunds part out of the note when there are none', async () => {
  summary = { ...base, outCents: 120000, backCents: 0 };
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('Mortgage and Amex payments not included.')).toBeTruthy();
});

it('the toggle adds mortgage and Amex payments to the total, money out and last month', async () => {
  summary = { ...base, mortgageCents: 300000, prevMortgageCents: 290000 };
  await renderScreen(<SpendingScreen />);
  await fireEvent(screen.getByLabelText('Include mortgage and Amex payments'), 'valueChange', true);
  // 1,200 + 3,000 mortgage + 2,000 Amex; last month 890 + 2,900 + 1,000.
  expect(screen.getByText('$6,200.00')).toBeTruthy();
  expect(screen.getByText('Money in $0 · Money out $6,500')).toBeTruthy();
  expect(screen.getByText('Spending is money out less $300 of refunds and paybacks. Includes mortgage $3,000 and Amex payments $2,000.')).toBeTruthy();
  expect(screen.getByText('$1,410 more than Sep')).toBeTruthy();
  expect(useSettings.getState().spendingIncludesPayments).toBe(true);
});

it('shows a less-than note', async () => {
  summary = { ...base, prevTotalCents: 151000 };
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('$310 less than Sep')).toBeTruthy();
});

it('hides the note when previous month is 0', async () => {
  summary = { ...base, prevTotalCents: 0 };
  await renderScreen(<SpendingScreen />);
  expect(screen.queryByText(/than Sep/)).toBeNull();
});

it('Amex chip sets the institution', async () => {
  await renderScreen(<SpendingScreen />);
  expect(mocked.useSpending).toHaveBeenLastCalledWith({ month: '2026-10' });
  await fireEvent.press(screen.getByText('Amex'));
  expect(mocked.useSpending).toHaveBeenLastCalledWith({ month: '2026-10', institution: 'Amex' });
});

it('sort box navigates to the inbox', async () => {
  await renderScreen(<SpendingScreen />);
  await fireEvent.press(screen.getByText('3 to sort this month · Sort ›'));
  expect(mockPush).toHaveBeenCalledWith('/inbox');
});

it('uses the singular for one transaction', async () => {
  summary = { ...base, uncategorisedCount: 1 };
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('1 to sort this month · Sort ›')).toBeTruthy();
});

it('hides zero-count not-counted entries', async () => {
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('Not counted as spending')).toBeTruthy();
  expect(screen.getByText('Transfers')).toBeTruthy();
  expect(screen.getByText('Not spending')).toBeTruthy();
  expect(screen.queryByText('Mortgage repayments')).toBeNull();
});

it('tapping Groceries opens the drill-down', async () => {
  await renderScreen(<SpendingScreen />);
  // The first match is the category bar; the Transactions page lists Groceries as a row subline too.
  await fireEvent.press(screen.getAllByText('Groceries')[0]);
  expect(mockPush).toHaveBeenCalledWith('/category/1?month=2026-10');
});

it('passes the institution to the drill-down and opens Uncategorised', async () => {
  await renderScreen(<SpendingScreen />);
  await fireEvent.press(screen.getByText('Amex'));
  await fireEvent.press(screen.getByText('Uncategorised'));
  expect(mockPush).toHaveBeenCalledWith('/category/none?month=2026-10&institution=Amex');
});

it('lists the institution split', async () => {
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('CommBank $700 · Amex $500')).toBeTruthy();
});

it('shows the empty state', async () => {
  summary = { ...base, totalCents: 0, byCategory: [], notCounted: [], uncategorisedCount: 0, byInstitution: [] };
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText('No spending this month.')).toBeTruthy();
});

it('shows a load error', async () => {
  (mocked.useSpending as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: false, isError: true, refetch: jest.fn() }));
  await renderScreen(<SpendingScreen />);
  expect(screen.getByText("Couldn't load spending. Pull to try again.")).toBeTruthy();
});

const lim = (o: object) => ({ id: 1, categoryId: 1, amountCents: 65000, warnPercent: 80, spentCents: 60000, percent: 92, level: 'warn', alertedAt: null, ...o });

it('draws limit markers scaled to the largest limit and lists warnings', async () => {
  limits = [
    lim({}),
    lim({ id: 2, categoryId: 2, amountCents: 100000, spentCents: 30000, percent: 30, level: 'ok' }),
    lim({ id: 3, categoryId: null, amountCents: 120000, spentCents: 120000, percent: 100, level: 'over' }),
  ];
  await renderScreen(<SpendingScreen />);
  const markers = screen.getAllByTestId('limit-marker');
  expect(markers).toHaveLength(2);
  expect(markers[0]).toHaveStyle({ left: '65%' });
  expect(markers[1]).toHaveStyle({ left: '100%' });
  expect(screen.getByText('Groceries is at 92% of your limit')).toBeTruthy();
  expect(screen.getByText("This month's spending is at 100% of your limit")).toBeTruthy();
  expect(screen.queryByText(/Dining out is at/)).toBeNull();
});

it('shows no markers or warning lines when an institution is chosen', async () => {
  limits = [lim({})];
  await renderScreen(<SpendingScreen />);
  await fireEvent.press(screen.getByText('Amex'));
  expect(screen.queryByTestId('limit-marker')).toBeNull();
  expect(screen.queryByText(/of your limit/)).toBeNull();
});

describe('Transactions page', () => {
  it('lists every transaction for the filters, labelling non-spending ones', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(screen.getByText('Woolworths')).toBeTruthy();
    expect(screen.getByText('SALARY ACME')).toBeTruthy();
    expect(screen.getByText('No category · not spending')).toBeTruthy();
    expect(screen.getByText('Transfer · not spending')).toBeTruthy();
    expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10' });
  });

  it('passes the bank chip to the list', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Amex'));
    expect(mocked.useTransactionsQuery).toHaveBeenLastCalledWith({ month: '2026-10', institution: 'Amex' });
  });

  it('filters by the search box', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    await fireEvent.changeText(screen.getByLabelText('Search transactions'), 'salary');
    expect(screen.getByText('SALARY ACME')).toBeTruthy();
    expect(screen.queryByText('Woolworths')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search transactions'), 'zzz');
    expect(screen.getByText('No transactions match "zzz".')).toBeTruthy();
  });

  it('badges each row with its bank', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(screen.getAllByTestId('bank-badge').length).toBeGreaterThan(0);
  });

  it('opens a transaction', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    await fireEvent.press(screen.getByText('Woolworths'));
    expect(mockPush).toHaveBeenCalledWith('/transaction/1');
  });

  it('shows the empty and error states', async () => {
    (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: { transactions: [] }, isLoading: false, isError: false }));
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(screen.getByText('No transactions this month.')).toBeTruthy();
    (mocked.useTransactionsQuery as jest.Mock).mockImplementation(() => ({ data: undefined, isLoading: false, isError: true }));
    await renderScreen(<SpendingScreen />);
    expect(screen.getByText("Couldn't load transactions. Pull to try again.")).toBeTruthy();
  });
});

describe('pager height', () => {
  const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 358, height } } });
  const pagerHeight = () => StyleSheet.flatten(screen.getByTestId('spending-pager').props.style)?.height;

  it('is as tall as the page on screen, not the taller one beside it', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent(screen.getByTestId('spending-page-0'), 'layout', layout(400));
    await fireEvent(screen.getByTestId('spending-page-1'), 'layout', layout(2000));
    expect(pagerHeight()).toBe(400);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(pagerHeight()).toBe(2000);
  });

  it('lets both pages show while swiping, then fits the page it lands on', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent(screen.getByTestId('spending-page-0'), 'layout', layout(400));
    await fireEvent(screen.getByTestId('spending-page-1'), 'layout', layout(2000));
    await fireEvent(screen.getByTestId('spending-pager'), 'scrollBeginDrag');
    expect(pagerHeight()).toBe(2000);
    await fireEvent(screen.getByTestId('spending-pager'), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    expect(pagerHeight()).toBe(400);
  });
});

describe('categorise by name', () => {
  it('offers to categorise everything matching a search of 3+ letters', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    await fireEvent.changeText(screen.getByLabelText('Search transactions'), 'sa');
    expect(screen.queryByText(/^Categorise everything named/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search transactions'), 'salary');
    await fireEvent.press(screen.getByText('Categorise everything named "salary" →'));
    expect(screen.getByLabelText('Name contains').props.value).toBe('salary');
  });
});

describe('clear search', () => {
  it('shows an X only while there is a search, and tapping it clears it', async () => {
    await renderScreen(<SpendingScreen />);
    await fireEvent.press(screen.getByText('Transactions'));
    expect(screen.queryByLabelText('Clear search')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search transactions'), 'salary');
    expect(screen.queryByText('Woolworths')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Search transactions').props.value).toBe('');
    expect(screen.getByText('Woolworths')).toBeTruthy();
    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });
});
