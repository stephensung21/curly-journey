import { requiredRepayment } from '@curly/core';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import HomeLoan from '../app/home-loan';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const save = jest.fn();
let profile: object;

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false });
  save.mockResolvedValue({});
  profile = { mortgageRateBps: null, repaymentCents: null, repaymentFrequency: 'monthly', termMonths: null, offsetGrowthCents: 0 };
  mocked.useProjections.mockImplementation((() => ({ data: { profile, prefill: { mortgageBalanceCents: 50_000_000, offsetCents: 0 } } })) as any);
  mocked.useUpdateProfile.mockImplementation((() => ({ mutateAsync: save, isPending: false })) as any);
});

it('saves rate 6.24 as 624 bps with the other fields', async () => {
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '6.24');
  await fireEvent.changeText(screen.getByLabelText('Repayment'), '3,000');
  await fireEvent.press(screen.getByText('Fortnightly'));
  await fireEvent.changeText(screen.getByLabelText('Years left'), '25');
  await fireEvent.changeText(screen.getByLabelText('Months left'), '6');
  await fireEvent.changeText(screen.getByLabelText('Offset grows by'), '500');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      mortgageRateBps: 624, repaymentCents: 300000, repaymentFrequency: 'fortnightly', termMonths: 306, offsetGrowthCents: 50000,
    }),
  );
  expect(mockBack).toHaveBeenCalled();
});

it('use the minimum fills from requiredRepayment', async () => {
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '6.24');
  await fireEvent.changeText(screen.getByLabelText('Years left'), '25');
  const min = requiredRepayment(50_000_000, 624, 300);
  await fireEvent.press(screen.getByText('Use the minimum:'));
  expect(screen.getByLabelText('Repayment').props.value).toBe((min / 100).toFixed(2));
  expect(screen.queryByText('Use the minimum:')).toBeNull();
});

it('hides the minimum until rate and term are known', async () => {
  await renderScreen(<HomeLoan />);
  expect(screen.queryByText('Use the minimum:')).toBeNull();
});

it('lets the offset shrink but caps it', async () => {
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '6');
  await fireEvent.changeText(screen.getByLabelText('Offset grows by'), '-200');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ offsetGrowthCents: -20000 })));
  save.mockClear();
  await fireEvent.changeText(screen.getByLabelText('Offset grows by'), '100001');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Keep this within $100,000 a month')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('rejects a rate over 20%', async () => {
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '21');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Enter a rate between 0 and 20')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('starts from the saved loan and clears blanks to null', async () => {
  profile = { mortgageRateBps: 599, repaymentCents: 250000, repaymentFrequency: 'weekly', termMonths: 300, offsetGrowthCents: 0 };
  await renderScreen(<HomeLoan />);
  expect(screen.getByLabelText('Interest rate %').props.value).toBe('5.99');
  expect(screen.getByLabelText('Years left').props.value).toBe('25');
  await fireEvent.changeText(screen.getByLabelText('Repayment'), '');
  await fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ repaymentCents: null, termMonths: 300 })));
});

it('shows an inline error when saving fails', async () => {
  save.mockRejectedValue(new Error('boom'));
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '6');
  await fireEvent.press(screen.getByText('Save'));
  expect(await screen.findByText("Couldn't save. Try again.")).toBeTruthy();
});

it('rejects a negative rate', async () => {
  await renderScreen(<HomeLoan />);
  await fireEvent.changeText(screen.getByLabelText('Interest rate %'), '-1');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Enter a rate between 0 and 20')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
});

it('says so when the details fail to load', async () => {
  mocked.useProjections.mockImplementation((() => ({ data: undefined, isError: true })) as any);
  await renderScreen(<HomeLoan />);
  expect(screen.getByText("Couldn't load your details. Go back and try again.")).toBeTruthy();
});
