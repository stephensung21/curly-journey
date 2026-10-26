import { screen, fireEvent } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TransactionRow } from '../src/components/TransactionRow';
import { TransactionList } from '../src/components/TransactionList';
import { categoryColor } from '../src/theme/categoryColor';
import { accents, themes } from '../src/theme/tokens';
import { useSettings } from '../src/settings/store';
import type { Category, Transaction } from '../src/api/types';
import { renderScreen } from '../test-utils/renderScreen';

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: 1, accountId: 7, date: '2026-10-22', amountCents: -8420, description: 'WOOLWORTHS 123 SYDNEY', merchant: 'Woolworths',
  status: 'posted', source: 'pocketsmith', categoryId: 3, categorySource: 'merchant', flow: 'normal', flowSource: 'auto',
  note: null, memo: null, feedCreatedAt: null, splits: [], ...over,
});
const groceries: Category = { id: 3, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 };

beforeEach(() => useSettings.setState({ hideBalances: false, themeMode: 'dark' }));

const colorOf = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never)?.color;

it('shows merchant and category name', async () => {
  await renderScreen(<TransactionRow txn={txn()} category={groceries} />);
  expect(screen.getByText('Woolworths')).toBeTruthy();
  expect(screen.getByText('Groceries')).toBeTruthy();
  expect(screen.getByText('🛒')).toBeTruthy();
});

it('falls back to the description without a merchant', async () => {
  await renderScreen(<TransactionRow txn={txn({ merchant: '' })} category={groceries} />);
  expect(screen.getByText('WOOLWORTHS 123 SYDNEY')).toBeTruthy();
});

it('prompts to sort an uncategorised row, in yellow', async () => {
  await renderScreen(<TransactionRow txn={txn({ categoryId: null, categorySource: null })} category={undefined} />);
  expect(screen.getByText('?')).toBeTruthy();
  expect(colorOf(screen.getByText('Uncategorised · tap to sort'))).toBe(themes.dark.strokeYellow);
});

it('marks a transfer', async () => {
  await renderScreen(<TransactionRow txn={txn({ flow: 'transfer', categoryId: null })} category={undefined} />);
  expect(screen.getByText('↔')).toBeTruthy();
  expect(screen.getByText('Transfer · not spending')).toBeTruthy();
});

it('marks a mortgage payment', async () => {
  await renderScreen(<TransactionRow txn={txn({ flow: 'mortgage', categoryId: null })} category={undefined} />);
  expect(screen.getByText('Mortgage · not spending')).toBeTruthy();
});

it('marks a not-spending row with its category', async () => {
  await renderScreen(<TransactionRow txn={txn({ flow: 'not_spending' })} category={groceries} />);
  expect(screen.getByText('Groceries · not spending')).toBeTruthy();
});

it('says No category on a not-spending row without one', async () => {
  await renderScreen(<TransactionRow txn={txn({ flow: 'not_spending', categoryId: null })} category={undefined} />);
  expect(screen.getByText('No category · not spending')).toBeTruthy();
});

it('shows the split count', async () => {
  const splits = [{ categoryId: 3, amountCents: -5000 }, { categoryId: 4, amountCents: -3420 }];
  await renderScreen(<TransactionRow txn={txn({ splits })} category={groceries} />);
  expect(screen.getByText('Split · 2 categories')).toBeTruthy();
});

it('appends Pending to the subline', async () => {
  await renderScreen(<TransactionRow txn={txn({ status: 'pending' })} category={groceries} />);
  expect(screen.getByText('Groceries · Pending')).toBeTruthy();
});

it('colours money out red and money in lime', async () => {
  await renderScreen(
    <>
      <TransactionRow txn={txn()} category={groceries} />
      <TransactionRow txn={txn({ id: 2, amountCents: 470000, merchant: 'Employer' })} category={groceries} />
    </>,
  );
  expect(colorOf(screen.getByText('−$84.20'))).toBe('#ff5c5c');
  expect(colorOf(screen.getByText('+$4,700.00'))).toBe(themes.dark.noteLime);
});

it('uses the darker red in light mode', async () => {
  useSettings.setState({ themeMode: 'light' });
  await renderScreen(<TransactionRow txn={txn()} category={groceries} />);
  expect(colorOf(screen.getByText('−$84.20'))).toBe('#c62828');
});

it('masks the amount when balances are hidden', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<TransactionRow txn={txn()} category={groceries} />);
  expect(screen.queryByText('−$84.20')).toBeNull();
  expect(screen.getByText('$•••')).toBeTruthy();
});

it('calls onPress', async () => {
  const onPress = jest.fn();
  await renderScreen(<TransactionRow txn={txn()} category={groceries} onPress={onPress} />);
  await fireEvent.press(screen.getByText('Woolworths'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

it('categoryColor maps line to the theme and others to accents', () => {
  expect(categoryColor('line', themes.light)).toBe(themes.light.line);
  expect(categoryColor('lime', themes.dark)).toBe(accents.lime);
});

it('TransactionList groups by day and resolves categories', async () => {
  const onPressTxn = jest.fn();
  await renderScreen(
    <TransactionList
      transactions={[txn(), txn({ id: 2, date: '2026-10-21', merchant: 'Cafe', categoryId: null })]}
      categories={[groceries]}
      today="2026-10-22"
      onPressTxn={onPressTxn}
    />,
  );
  expect(screen.getByText('Today · Thu 22 Oct')).toBeTruthy();
  expect(screen.getByText('Yesterday · Wed 21 Oct')).toBeTruthy();
  expect(screen.getByText('Groceries')).toBeTruthy();
  await fireEvent.press(screen.getByText('Cafe'));
  expect(onPressTxn).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
});

describe('bank badge', () => {
  it('shows the bank logo on the tile when an institution is given', async () => {
    await renderScreen(<TransactionRow txn={txn()} category={groceries} institution="CommBank" />);
    expect(screen.getByTestId('bank-badge')).toBeTruthy();
  });

  it('shows no badge without an institution, or for a bank with no logo', async () => {
    await renderScreen(<TransactionRow txn={txn()} category={groceries} />);
    expect(screen.queryByTestId('bank-badge')).toBeNull();
    await renderScreen(<TransactionRow txn={txn()} category={groceries} institution="CoinSpot" />);
    expect(screen.queryByTestId('bank-badge')).toBeNull();
  });

  it('TransactionList badges each row from its account', async () => {
    const accounts = [{ id: 7, institution: 'Amex' }, { id: 8, institution: 'Up' }] as never;
    await renderScreen(
      <TransactionList transactions={[txn(), txn({ id: 2, accountId: 8 }), txn({ id: 3, accountId: 99 })]} categories={[groceries]} today="2026-10-22" accounts={accounts} />,
    );
    expect(screen.getAllByTestId('bank-badge')).toHaveLength(2);
  });
});
