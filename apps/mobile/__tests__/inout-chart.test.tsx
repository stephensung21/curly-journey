import { fireEvent, render, screen } from '@testing-library/react-native';
import { InOutChart } from '../src/components/InOutChart';
import type { DailyPoint, InOutMonth } from '../src/api/types';

const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const six: InOutMonth[] = months.map((month, i) => ({
  month,
  inCents: 520000,
  mortgageCents: 310000,
  spendingCents: 248000 + i,
}));
six[4] = { month: '2026-09', inCents: 520000, mortgageCents: 310000, spendingCents: 248000 };

const daily: DailyPoint[] = Array.from({ length: 22 }, (_, i) => ({
  day: i + 1,
  inCents: i * 1000,
  mortgageCents: 0,
  spendingCents: i * 500,
}));

it('renders 6 month labels ending with the current month', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances={false} onHero />);
  for (const m of ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']) expect(screen.getByText(m)).toBeTruthy();
});

it('labels the y axis with short dollar values', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances={false} onHero />);
  // max 5200 -> nice max $10k? smallest of {1,2,2.5,5}x10^k >= 5200 is 10000
  for (const l of ['$0', '$2.5k', '$5k', '$7.5k', '$10k']) expect(screen.getByText(l)).toBeTruthy();
});

it('uses $100 as max when everything is zero', async () => {
  const zero = months.map(month => ({ month, inCents: 0, mortgageCents: 0, spendingCents: 0 }));
  await render(<InOutChart mode="sixMonths" data={zero} hideBalances={false} onHero />);
  expect(screen.getByText('$100')).toBeTruthy();
  expect(screen.getByText('$25')).toBeTruthy();
});

it('masks every y label when balances are hidden', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances onHero />);
  expect(screen.getAllByText('$•••')).toHaveLength(5);
  expect(screen.queryByText('$10k')).toBeNull();
});

it('shows the figures row when a month is tapped', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances={false} onHero />);
  expect(screen.queryByText(/September:/)).toBeNull();
  await fireEvent.press(screen.getByLabelText('September'));
  expect(screen.getByText('September: in $5,200 · mortgage $3,100 · spending $2,480')).toBeTruthy();
});

it('masks the figures row when hidden', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances onHero />);
  await fireEvent.press(screen.getByLabelText('September'));
  expect(screen.getByText('September: in $••• · mortgage $••• · spending $•••')).toBeTruthy();
});

it('this-month mode shows day labels incl. first and last day', async () => {
  await render(<InOutChart mode="thisMonth" data={daily} daysInMonth={31} hideBalances={false} onHero />);
  for (const d of ['1', '8', '15', '22', '31']) expect(screen.getByText(d)).toBeTruthy();
});

it('shows the legend', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances={false} onHero />);
  expect(screen.getByText('In')).toBeTruthy();
  expect(screen.getByText('Mortgage')).toBeTruthy();
  expect(screen.getByText('Spending')).toBeTruthy();
});

it('summarises the latest month in the accessibility label', async () => {
  await render(<InOutChart mode="sixMonths" data={six} hideBalances={false} onHero />);
  expect(screen.getByLabelText(/October: in \$5,200/)).toBeTruthy();
});
