import { compareOffset, formatAud, monthlyRepayment, requiredRepayment, shiftMonths } from '@curly/core';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import Projections from '../app/(tabs)/projections';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => ({ push: mockPush, back: jest.fn() }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
let profile: Record<string, unknown>;
let prefill: Record<string, unknown>;

const baseProfile = {
  birthDate: '1990-06-15', taxRateBps: null, mortgageRateBps: 600, repaymentCents: 340_000, repaymentFrequency: 'monthly',
  termMonths: 300, offsetGrowthCents: 50_000, returnBps: 700, inflationBps: 250, distributionYieldBps: 300,
  targetCents: 100_000_000, targetAge: 60, todaysDollars: false,
};
const input = (over: Record<string, number> = {}) => ({
  balanceCents: 50_000_000, rateBps: 600, monthlyRepaymentCents: 340_000, offsetCents: 5_000_000, offsetGrowthCents: 50_000, extraMonthlyCents: 0, rateChangeBps: 0, ...over,
});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (m: number) => {
  const iso = shiftMonths('2026-10-25', m);
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
};
const bump = (label: string, name: 'increment' | 'decrement') =>
  fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: name } });
const open = async () => {
  await renderScreen(<Projections />);
  await fireEvent.press(screen.getByText('Mortgage'));
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false });
  profile = { ...baseProfile };
  prefill = { etfStartCents: 0, etfMonthlyCents: 0, mortgageBalanceCents: 50_000_000, offsetCents: 5_000_000, today: '2026-10-25' };
  mocked.useProjections.mockImplementation((() => ({ data: { profile, prefill } })) as any);
  mocked.useUpdateProfile.mockImplementation((() => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false })) as any);
});

it('headline date matches compareOffset', async () => {
  await open();
  const r = compareOffset(input());
  expect(screen.getByText('Mortgage-free')).toBeTruthy();
  expect(screen.getByText(dateLabel(r.withOffset.payoffMonth!))).toBeTruthy();
});

it('says how much sooner than the term', async () => {
  await open();
  const sooner = 300 - compareOffset(input()).withOffset.payoffMonth!;
  expect(sooner).toBeGreaterThan(0);
  const y = Math.floor(sooner / 12), m = sooner % 12;
  const txt = [y ? `${y} ${y === 1 ? 'year' : 'years'}` : '', m ? `${m} ${m === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ');
  expect(screen.getByText(`${txt} sooner than your term`)).toBeTruthy();
});

const spanText = (n: number) => {
  const y = Math.floor(n / 12), m = n % 12;
  return [y ? `${y} ${y === 1 ? 'year' : 'years'}` : '', m ? `${m} ${m === 1 ? 'month' : 'months'}` : ''].filter(Boolean).join(' ');
};

it('says how much the offsets save as a second line', async () => {
  await open();
  const r = compareOffset(input());
  const saved = r.withoutOffset.payoffMonth! - r.withOffset.payoffMonth!;
  expect(saved).toBeGreaterThan(0);
  expect(screen.getByText(`Offsets save you ${spanText(saved)}`)).toBeTruthy();
});

it('omits the offsets-save line when offsets change nothing', async () => {
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  expect(screen.queryByText(/Offsets save you/)).toBeNull();
});

it('says offsets help when only the without-offset loan is unpaid', async () => {
  profile.repaymentCents = 300_000;
  prefill.mortgageBalanceCents = 60_000_000;
  prefill.offsetCents = 40_000_000;
  profile.offsetGrowthCents = 0;
  await open();
  const r = compareOffset(input({ balanceCents: 60_000_000, monthlyRepaymentCents: 300_000, offsetCents: 40_000_000, offsetGrowthCents: 0 }));
  expect(r.withoutOffset.payoffMonth).toBeNull();
  expect(r.withOffset.payoffMonth).not.toBeNull();
  expect(screen.getByText('Offsets help you pay it off within 50 years')).toBeTruthy();
  expect(screen.getByText('Interest saved is at least this (50-year limit)')).toBeTruthy();
  expect(screen.queryByText('At least these amounts over 50 years')).toBeNull();
});

it('draws the offset area at the chart default opacity', async () => {
  await open();
  expect(JSON.stringify(screen.toJSON())).not.toContain('"opacity":0.2');
});

it('says on track when not sooner than the term', async () => {
  profile.termMonths = 100;
  profile.repaymentCents = requiredRepayment(50_000_000, 600, 100);
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  expect(screen.getByText('On track for your term')).toBeTruthy();
});

it('says not paid off when the repayment cannot clear the loan', async () => {
  profile.repaymentCents = 100_000;
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  expect(screen.getByText('Not paid off at this repayment')).toBeTruthy();
  expect(screen.getByText(/at least/i)).toBeTruthy();
});

it('shows the interest tiles', async () => {
  await open();
  const r = compareOffset(input());
  expect(screen.getByText('Interest saved')).toBeTruthy();
  expect(screen.getByText('Interest left')).toBeTruthy();
  expect(screen.getByText(formatAud(r.interestSavedCents, { decimals: 'never' }))).toBeTruthy();
  expect(screen.getByText(formatAud(r.withOffset.interestCents, { decimals: 'never' }))).toBeTruthy();
});

it('shows the setup card when the term is missing', async () => {
  profile.termMonths = null;
  await open();
  await fireEvent.press(screen.getByText('Set up your home loan'));
  expect(mockPush).toHaveBeenCalledWith('/home-loan');
  expect(screen.queryByText('Mortgage-free')).toBeNull();
});

it('says the loan is paid off when terms are saved but the balance is 0', async () => {
  prefill.mortgageBalanceCents = 0;
  await open();
  expect(screen.getByText('Your home loan is paid off 🎉')).toBeTruthy();
  expect(screen.queryByText('Set up your home loan')).toBeNull();
});

it('shows the setup card when there is no balance and no terms', async () => {
  prefill.mortgageBalanceCents = 0;
  profile.termMonths = null;
  await open();
  expect(screen.getByText('Set up your home loan')).toBeTruthy();
});

it('says how much later than the term when a rate rise pushes payoff past it', async () => {
  profile.repaymentCents = null;
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  for (let i = 0; i < 4; i++) await bump('Rate change', 'increment');
  const pay = requiredRepayment(50_000_000, 600, 300);
  const payoff = compareOffset(input({ monthlyRepaymentCents: pay, offsetCents: 0, offsetGrowthCents: 0, rateChangeBps: 100 })).withOffset.payoffMonth!;
  expect(payoff).toBeGreaterThan(300);
  expect(screen.getByText(`${spanText(payoff - 300)} later than your term`)).toBeTruthy();
  expect(screen.queryByText('On track for your term')).toBeNull();
});

it('counts the term down from the day it was saved', async () => {
  profile.termSetOn = '2026-07-25'; // three months before today
  profile.repaymentCents = null;
  await open();
  const pay = requiredRepayment(50_000_000, 600, 297);
  const payoff = compareOffset(input({ monthlyRepaymentCents: pay })).withOffset.payoffMonth!;
  expect(screen.getByText(`${spanText(297 - payoff)} sooner than your term`)).toBeTruthy();
  expect(screen.getByText(/24 years 9 months/)).toBeTruthy();
});

it('falls back to the minimum repayment when none is saved', async () => {
  profile.repaymentCents = null;
  await open();
  expect(screen.getByText('Using the minimum repayment')).toBeTruthy();
  const pay = requiredRepayment(50_000_000, 600, 300);
  const r = compareOffset(input({ monthlyRepaymentCents: pay }));
  expect(screen.getByText(dateLabel(r.withOffset.payoffMonth!))).toBeTruthy();
});

it('converts weekly repayments to monthly', async () => {
  profile.repaymentCents = 80_000;
  profile.repaymentFrequency = 'weekly';
  await open();
  const r = compareOffset(input({ monthlyRepaymentCents: monthlyRepayment(80_000, 'weekly') }));
  expect(screen.getByText(dateLabel(r.withOffset.payoffMonth!))).toBeTruthy();
});

it('extra repayment slider brings the date earlier', async () => {
  await open();
  const before = compareOffset(input()).withOffset.payoffMonth!;
  expect(screen.getByLabelText('Extra repayment').props.accessibilityValue).toEqual({ min: 0, max: 500_000, now: 0 });
  await bump('Extra repayment', 'increment');
  const now = screen.getByLabelText('Extra repayment').props.accessibilityValue.now;
  expect(now).toBeGreaterThan(0);
  const after = compareOffset(input({ extraMonthlyCents: now })).withOffset.payoffMonth!;
  expect(after).toBeLessThan(before);
  expect(screen.getByText(dateLabel(after))).toBeTruthy();
  expect(screen.queryByText(dateLabel(before))).toBeNull();
});

it('rate change slider runs -2% to +3% in 0.25% steps', async () => {
  await open();
  expect(screen.getByLabelText('Rate change').props.accessibilityValue).toEqual({ min: -2, max: 3, now: 0 });
  await bump('Rate change', 'increment');
  expect(screen.getByLabelText('Rate change').props.accessibilityValue.now).toBe(0.25);
});

it('keeps slider values when switching modes', async () => {
  await open();
  await bump('Extra repayment', 'increment');
  const now = screen.getByLabelText('Extra repayment').props.accessibilityValue.now;
  await fireEvent.press(screen.getByText('ETFs'));
  await fireEvent.press(screen.getByText('Mortgage'));
  expect(screen.getByLabelText('Extra repayment').props.accessibilityValue.now).toBe(now);
});

it('opens the home loan screen from the Loan and Offsets rows', async () => {
  await open();
  await fireEvent.press(screen.getByText('Loan'));
  await fireEvent.press(screen.getByText('Offsets'));
  expect(mockPush).toHaveBeenCalledTimes(2);
  expect(mockPush).toHaveBeenCalledWith('/home-loan');
});

it('masks the tiles under hide balances', async () => {
  useSettings.setState({ hideBalances: true });
  await open();
  const r = compareOffset(input());
  expect(screen.queryByText(formatAud(r.interestSavedCents, { decimals: 'never' }))).toBeNull();
  expect(screen.queryByText(formatAud(r.withOffset.interestCents, { decimals: 'never' }))).toBeNull();
  expect(screen.getAllByText(/•••/).length).toBeGreaterThanOrEqual(2);
});
