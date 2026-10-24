import { addMonthsLabel, compareOffset, crossoverMonth, formatAud, monthsUntilAge, offsetVsInvest, projectEtf } from '@curly/core';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { accents } from '../src/theme/tokens';
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
  birthDate: '1990-06-15', taxRateBps: 3000, mortgageRateBps: 600, repaymentCents: 340_000, repaymentFrequency: 'monthly',
  termMonths: 300, offsetGrowthCents: 50_000, returnBps: 700, inflationBps: 250, distributionYieldBps: 300,
  targetCents: 100_000_000, targetAge: 60, todaysDollars: false,
};
const mortgage = (over: Record<string, number> = {}) => ({
  balanceCents: 50_000_000, rateBps: 600, monthlyRepaymentCents: 340_000, offsetCents: 5_000_000, offsetGrowthCents: 50_000, extraMonthlyCents: 0, rateChangeBps: 0, ...over,
});
const plural = (n: number, u: string) => `${n} ${u}${n === 1 ? '' : 's'}`;
const spanText = (n: number) => [Math.floor(n / 12) ? plural(Math.floor(n / 12), 'year') : '', n % 12 ? plural(n % 12, 'month') : ''].filter(Boolean).join(' ');
const aud = (c: number) => formatAud(c, { decimals: 'never' });
const gain = (c: number) => formatAud(c, { decimals: 'never', signed: true });
const offRow = (r: { offsetGainCents: number }, tail: string) => `Into offsets → ${gain(r.offsetGainCents)} better off at 60 · ${tail}`;
const etfRow = (r: { etfGainCents: number }) => `Into ETFs → ${gain(r.etfGainCents)} better off at 60 (after tax on distributions)`;
const colorOf = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).color;
const bump = (label: string, name: 'increment' | 'decrement') =>
  fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: name } });
const open = async () => {
  await renderScreen(<Projections />);
  await fireEvent.press(screen.getByText('Both'));
};
const etf = () => projectEtf({ startCents: prefill.etfStartCents as number, monthlyCents: prefill.etfMonthlyCents as number, returnBps: 700, months: 600 });
const loan = (over: Record<string, number> = {}) => compareOffset(mortgage(over)).withOffset;
const ageMonth = () => Math.min(600, monthsUntilAge('1990-06-15', '2026-10-25', 60));
const vs = (spare: number, m: Record<string, number> = {}, tax = 3000) =>
  offsetVsInvest({
    mortgage: mortgage(m),
    etf: { startCents: prefill.etfStartCents as number, monthlyCents: prefill.etfMonthlyCents as number, returnBps: 700, months: 0 },
    spareCents: spare,
    distributionYieldBps: 300,
    taxRateBps: tax,
    atMonth: ageMonth(),
  });

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false });
  profile = { ...baseProfile };
  prefill = { etfStartCents: 20_000_000, etfMonthlyCents: 300_000, mortgageBalanceCents: 50_000_000, offsetCents: 5_000_000, today: '2026-10-25' };
  mocked.useProjections.mockImplementation((() => ({ data: { profile, prefill } })) as any);
  mocked.useUpdateProfile.mockImplementation((() => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false })) as any);
});

it('crossover year matches core', async () => {
  await open();
  const m = crossoverMonth(etf(), loan().points)!;
  expect(m).toBeGreaterThan(0);
  expect(screen.getByText(`ETFs overtake your mortgage in ${addMonthsLabel('2026-10-25', m)}`)).toBeTruthy();
});

it('says the ETFs already cover the loan', async () => {
  prefill.etfStartCents = 60_000_000;
  await open();
  expect(screen.getByText('Your ETFs already cover the loan')).toBeTruthy();
});

it('says not within 50 years when they never cross', async () => {
  prefill.etfStartCents = 0;
  prefill.etfMonthlyCents = 0;
  profile.repaymentCents = 100_000;
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  expect(screen.getByText('Not within 50 years')).toBeTruthy();
});

it('shows ETFs, loan and net at the chosen age', async () => {
  await open();
  const m = ageMonth();
  const e = etf()[m]!.valueCents;
  const l = loan().points[m]?.balanceCents ?? 0;
  expect(screen.getByText('ETFs at 60')).toBeTruthy();
  expect(screen.getByText('Loan at 60')).toBeTruthy();
  expect(screen.getByText('Net')).toBeTruthy();
  expect(screen.getAllByText(aud(e)).length).toBeGreaterThan(0);
  expect(screen.getAllByText(aud(l)).length).toBeGreaterThan(0);
  expect(screen.getAllByText(aud(e - l)).length).toBeGreaterThan(0);
});

it('labels tiles with years without a birth date', async () => {
  profile.birthDate = null;
  await open();
  expect(screen.getByText('ETFs in 25 years')).toBeTruthy();
});

it('spare cash slider is $0-$3,000, default $500, and changes both rows', async () => {
  await open();
  expect(screen.getByLabelText('Spare cash').props.accessibilityValue).toEqual({ min: 0, max: 300_000, now: 50_000 });
  const rows = (r: ReturnType<typeof vs>) => ({
    off: offRow(r, `mortgage-free ${spanText(r.monthsSooner!)} sooner`),
    inv: etfRow(r),
  });
  const r1 = vs(50_000);
  expect(r1.monthsSooner).toBeGreaterThan(0);
  expect(screen.getByText(rows(r1).off)).toBeTruthy();
  expect(screen.getByText(rows(r1).inv)).toBeTruthy();
  await bump('Spare cash', 'increment');
  const now = screen.getByLabelText('Spare cash').props.accessibilityValue.now;
  expect(now).toBeGreaterThan(50_000);
  const r2 = vs(now);
  expect(screen.getByText(rows(r2).off)).toBeTruthy();
  expect(screen.getByText(rows(r2).inv)).toBeTruthy();
  expect(screen.queryByText(rows(r1).inv)).toBeNull();
});

it('keeps the spare cash value when switching modes', async () => {
  await open();
  await bump('Spare cash', 'increment');
  const now = screen.getByLabelText('Spare cash').props.accessibilityValue.now;
  await fireEvent.press(screen.getByText('ETFs'));
  await fireEvent.press(screen.getByText('Both'));
  expect(screen.getByLabelText('Spare cash').props.accessibilityValue.now).toBe(now);
});

it('says neither pays it off within 50 years when both loans stay unpaid', async () => {
  profile.repaymentCents = 100_000;
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  await bump('Spare cash', 'decrement');
  const spare = screen.getByLabelText('Spare cash').props.accessibilityValue.now;
  const r = vs(spare, { monthlyRepaymentCents: 100_000, offsetCents: 0, offsetGrowthCents: 0 });
  expect(screen.getByText(offRow(r, 'neither pays it off within 50 years'))).toBeTruthy();
  expect(screen.queryByText(/sooner/)).toBeNull();
});

it('says pays it off within 50 years when only the boosted loan clears', async () => {
  profile.repaymentCents = 200_000;
  prefill.offsetCents = 0;
  profile.offsetGrowthCents = 0;
  await open();
  for (let i = 0; i < 30; i++) await bump('Spare cash', 'increment');
  const spare = screen.getByLabelText('Spare cash').props.accessibilityValue.now;
  const r = vs(spare, { monthlyRepaymentCents: 200_000, offsetCents: 0, offsetGrowthCents: 0 });
  expect(r.monthsSooner).toBeNull();
  expect(screen.getByText(offRow(r, 'pays it off within 50 years'))).toBeTruthy();
});

it('distributions slider is 0-8% in 0.25% steps, changes the ETF row and is saved', async () => {
  const mutate = jest.fn();
  mocked.useUpdateProfile.mockImplementation((() => ({ mutate, mutateAsync: mutate, isPending: false })) as any);
  jest.useFakeTimers();
  try {
    await open();
    expect(screen.getByLabelText('Distributions').props.accessibilityValue).toEqual({ min: 0, max: 800, now: 300 });
    await bump('Distributions', 'increment');
    const r = offsetVsInvest({
      mortgage: mortgage(),
      etf: { startCents: 20_000_000, monthlyCents: 300_000, returnBps: 700, months: 0 },
      spareCents: 50_000, distributionYieldBps: 325, taxRateBps: 3000, atMonth: ageMonth(),
    });
    expect(screen.getByText(etfRow(r))).toBeTruthy();
    expect(screen.getByText('7% return · 2.5% inflation · 3.25% distributions taxed at 30%')).toBeTruthy();
    await jest.advanceTimersByTimeAsync(1100);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ distributionYieldBps: 325 }));
  } finally {
    jest.useRealTimers();
  }
});

it('notes that the offsets row assumes the cash is invested after payoff', async () => {
  await open();
  expect(screen.getByText('Assumes the cash is invested once the loan is paid off')).toBeTruthy();
});

it('shows the assumptions line', async () => {
  await open();
  expect(screen.getByText('7% return · 2.5% inflation · 3% distributions taxed at 30%')).toBeTruthy();
  expect(screen.queryByText('Add your tax rate for a fairer comparison')).toBeNull();
});

it('prompts for a tax rate when unset and links to About you', async () => {
  profile.taxRateBps = null;
  await open();
  await fireEvent.press(screen.getByText('Add your tax rate for a fairer comparison'));
  expect(mockPush).toHaveBeenCalledWith('/about-you');
});

it('uses a zero tax rate when unset', async () => {
  profile.taxRateBps = null;
  await open();
  const r = vs(50_000, {}, 0);
  expect(screen.getByText(etfRow(r))).toBeTruthy();
});

it('highlights the offsets row when it leaves you better off', async () => {
  profile.taxRateBps = 4500;
  profile.targetAge = 45;
  await open();
  const r = offsetVsInvest({
    mortgage: mortgage(),
    etf: { startCents: 20_000_000, monthlyCents: 300_000, returnBps: 700, months: 0 },
    spareCents: 50_000, distributionYieldBps: 300, taxRateBps: 4500, atMonth: monthsUntilAge('1990-06-15', '2026-10-25', 45),
  });
  expect(r.offsetGainCents).toBeGreaterThan(r.etfGainCents);
  const off = `Into offsets → ${gain(r.offsetGainCents)} better off at 45 · mortgage-free ${spanText(r.monthsSooner!)} sooner`;
  const inv = `Into ETFs → ${gain(r.etfGainCents)} better off at 45 (after tax on distributions)`;
  expect(colorOf(off)).toBe(accents.lime);
  expect(colorOf(inv)).not.toBe(accents.lime);
});

it('highlights the ETFs row when it leaves you better off', async () => {
  profile.taxRateBps = 0;
  profile.distributionYieldBps = 0;
  profile.returnBps = 1000;
  await open();
  const r = offsetVsInvest({
    mortgage: mortgage(),
    etf: { startCents: 20_000_000, monthlyCents: 300_000, returnBps: 1000, months: 0 },
    spareCents: 50_000, distributionYieldBps: 0, taxRateBps: 0, atMonth: ageMonth(),
  });
  expect(r.etfGainCents).toBeGreaterThan(r.offsetGainCents);
  expect(colorOf(etfRow(r))).toBe(accents.lime);
  expect(colorOf(offRow(r, `mortgage-free ${spanText(r.monthsSooner!)} sooner`))).not.toBe(accents.lime);
});

it('shows the setup card without a home loan', async () => {
  profile.termMonths = null;
  await open();
  await fireEvent.press(screen.getByText('Set up your home loan'));
  expect(mockPush).toHaveBeenCalledWith('/home-loan');
  expect(screen.queryByText('Net')).toBeNull();
});

it('masks tiles and rows under hide balances', async () => {
  useSettings.setState({ hideBalances: true });
  await open();
  expect(screen.queryByText(aud(etf()[ageMonth()]!.valueCents))).toBeNull();
  expect(screen.getAllByText(/•••/).length).toBeGreaterThanOrEqual(4);
});

it('shows the disclaimer', async () => {
  await open();
  expect(screen.getByText(/General information only/)).toBeTruthy();
});

it('says the mortgage is paid off first when the loan ends before the ETFs pass it', async () => {
  prefill.etfStartCents = 0;
  prefill.etfMonthlyCents = 0;
  await open();
  const pay = compareOffset(mortgage()).withOffset.payoffMonth!;
  expect(pay).toBeGreaterThan(0);
  expect(screen.getByText(`Mortgage paid off first, in ${addMonthsLabel('2026-10-25', pay)}`)).toBeTruthy();
  expect(screen.queryByText(/ETFs overtake/)).toBeNull();
});

it('assumptions line shows the session return after it changes', async () => {
  await renderScreen(<Projections />);
  bump('Expected return', 'increment');
  await fireEvent.press(screen.getByText('Both'));
  expect(screen.getByText(/^7\.25% return/)).toBeTruthy();
});
