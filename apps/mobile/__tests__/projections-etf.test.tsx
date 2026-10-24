import { formatAud, projectEtf, todaysDollars } from '@curly/core';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import Projections from '../app/(tabs)/projections';
import * as hooks from '../src/api/hooks';
import { DISCLAIMER } from '../src/components/Disclaimer';
import { useSettings } from '../src/settings/store';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useRouter: () => ({ push: mockPush, back: jest.fn() }), useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const mutate = jest.fn();
let profile: Record<string, unknown>;
let prefill: Record<string, unknown>;

const baseProfile = {
  birthDate: '1990-06-15', taxRateBps: null, mortgageRateBps: null, repaymentCents: null, repaymentFrequency: 'monthly',
  termMonths: null, offsetGrowthCents: 0, returnBps: 700, inflationBps: 250, distributionYieldBps: 300,
  targetCents: 100_000_000, targetAge: 60, todaysDollars: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false });
  profile = { ...baseProfile };
  prefill = { etfStartCents: 5_000_000, etfMonthlyCents: 100_000, mortgageBalanceCents: 0, offsetCents: 0, today: '2026-10-25' };
  mocked.useProjections.mockImplementation((() => ({ data: { profile, prefill } })) as any);
  mocked.useUpdateProfile.mockImplementation((() => ({ mutate, mutateAsync: mutate, isPending: false })) as any);
});

const months = 60 * 12 - (2026 - 1990) * 12 - (10 - 6); // age 36y4m at 2026-10-25
const valueAt = (start: number, monthly: number, bps: number, m: number) => projectEtf({ startCents: start, monthlyCents: monthly, returnBps: bps, months: m })[m]!.valueCents;
const bump = (label: string, name: 'increment' | 'decrement') =>
  fireEvent(screen.getByLabelText(label), 'accessibilityAction', { nativeEvent: { actionName: name } });

it('headline matches projectEtf for the pre-fill', async () => {
  await renderScreen(<Projections />);
  expect(screen.getByText("At 60 you'd have")).toBeTruthy();
  expect(screen.getByText(formatAud(valueAt(5_000_000, 100_000, 700, months), { decimals: 'never' }))).toBeTruthy();
});

it('incrementing the monthly slider changes the headline', async () => {
  await renderScreen(<Projections />);
  await bump('Monthly contribution', 'increment');
  const next = screen.getAllByText(/^\$[\d,]+$/).map(n => n.props.children);
  const before = formatAud(valueAt(5_000_000, 100_000, 700, months), { decimals: 'never' });
  expect(next).not.toContain(before);
});

it('says Already there when the start meets the target', async () => {
  prefill.etfStartCents = 150_000_000;
  await renderScreen(<Projections />);
  expect(screen.getByText('Already there')).toBeTruthy();
});

it('says when the target is hit, with year and age', async () => {
  await renderScreen(<Projections />);
  expect(screen.getByText(/^Hits \$1M in 20\d\d \(age \d+\)$/)).toBeTruthy();
});

it('says when the target is never reached', async () => {
  profile.targetCents = 500_000_000;
  prefill.etfStartCents = 0;
  prefill.etfMonthlyCents = 0;
  await renderScreen(<Projections />);
  expect(screen.getByText("Doesn't reach $5M by 100")).toBeTruthy();
});

it('survives 0 contribution and 0% return', async () => {
  prefill.etfMonthlyCents = 0;
  profile.returnBps = 0;
  await renderScreen(<Projections />);
  expect(screen.getAllByText(formatAud(5_000_000, { decimals: 'never' })).length).toBe(2); // headline + start slider
});

it('without a birth date shows years and a link to add it', async () => {
  profile.birthDate = null;
  await renderScreen(<Projections />);
  expect(screen.getByText(/^In \d+ years you'd have$/)).toBeTruthy();
  await fireEvent.press(screen.getByText('Add your birth date'));
  expect(mockPush).toHaveBeenCalledWith('/about-you');
});

it('has no birth-date link when there is one', async () => {
  await renderScreen(<Projections />);
  expect(screen.queryByText('Add your birth date')).toBeNull();
});

it("today's dollars lowers the headline", async () => {
  await renderScreen(<Projections />);
  const nominal = valueAt(5_000_000, 100_000, 700, months);
  await fireEvent(screen.getByLabelText("Show in today's dollars"), 'valueChange', true);
  expect(screen.queryByText(formatAud(nominal, { decimals: 'never' }))).toBeNull();
  expect(screen.getByText(formatAud(todaysDollars(nominal, months, 250), { decimals: 'never' }))).toBeTruthy();
});

it('saves changed profile fields once, 1s after the last change', async () => {
  jest.useFakeTimers();
  try {
    await renderScreen(<Projections />);
    await bump('Expected return', 'increment');
    await bump('Expected return', 'increment');
    expect(mutate).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1100);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ returnBps: 750 }));
  } finally {
    jest.useRealTimers();
  }
});

it('hide balances masks headline, axis labels and slider values', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<Projections />);
  expect(screen.queryByText(/\$\d/)).toBeNull();
  expect(screen.getAllByText('$•••').length).toBeGreaterThan(5);
});

it('shows the disclaimer', async () => {
  await renderScreen(<Projections />);
  expect(screen.getByText(DISCLAIMER)).toBeTruthy();
});
