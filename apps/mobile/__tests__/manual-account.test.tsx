import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountDetail from '../app/account/[id]';
import NewManualAccount from '../app/account/new';
import * as hooks from '../src/api/hooks';
import { useSettings } from '../src/settings/store';

const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: mockReplace }),
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-24T02:00:00Z') })); // 24 Oct, Sydney
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const create = jest.fn();
const setValue = jest.fn();
const manual = {
  id: 7, source: 'manual', institution: 'Manual', name: 'AMP super', displayName: null, kind: 'manual_asset', balanceCents: 8500000,
  balanceDate: '2026-07-01', countsSpending: false, countsNetWorth: true, projections: 'off', isOffset: false, stale: false,
  icon: '🦘', syncedAt: null, needsUpdate: true,
};
const coinspot = {
  ...manual, source: 'coinspot', institution: 'CoinSpot', name: 'CoinSpot', kind: 'crypto', icon: null, balanceDate: null,
  needsUpdate: false, syncedAt: '2026-10-22T20:41:00Z', balanceCents: 1300000,
};
let account: object;

beforeEach(() => {
  jest.clearAllMocks();
  account = manual;
  create.mockResolvedValue({ id: 12 });
  setValue.mockResolvedValue({});
  (mocked.useAccounts as jest.Mock).mockImplementation(() => ({ data: { accounts: [account], lastSuccessAt: null }, isLoading: false }));
  (mocked.useCreateManualAccount as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false });
  (mocked.useSetAccountValue as jest.Mock).mockReturnValue({ mutateAsync: setValue, isPending: false });
  (mocked.useAccountValues as jest.Mock).mockReturnValue({
    data: { values: [{ asOf: '2026-07-01', valueCents: 8500000 }, { asOf: '2026-04-01', valueCents: 8000000 }] },
  });
  (mocked.useHoldings as jest.Mock).mockReturnValue({
    data: { holdings: [{ symbol: 'BTC', units: '0.0412', audCents: 900000 }, { symbol: 'ETH', units: '1.5', audCents: 400000 }] },
  });
});

describe('add a manual account', () => {
  it('posts the name, icon, value and today', async () => {
    await renderScreen(<NewManualAccount />);
    expect(screen.getByText('Add a manual account')).toBeTruthy();
    expect(screen.getByText('super stays out of your spending, promise')).toBeTruthy();
    expect(screen.getByText('Sat 24 Oct 2026')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Name'), 'AMP super');
    await fireEvent.changeText(screen.getByLabelText('Value'), '85000.00');
    await fireEvent.press(screen.getByText('Save'));
    expect(create).toHaveBeenCalledWith({ name: 'AMP super', icon: '🦘', valueCents: 8500000, asOf: '2026-10-24' });
    expect(mockReplace).toHaveBeenCalledWith('/account/12');
  });

  it('asks for a name and a value', async () => {
    await renderScreen(<NewManualAccount />);
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Give it a name')).toBeTruthy();
    expect(screen.getByText('Enter a value')).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it('picks a past As of date and blocks future days', async () => {
    await renderScreen(<NewManualAccount />);
    await fireEvent.changeText(screen.getByLabelText('Name'), 'Home');
    await fireEvent.changeText(screen.getByLabelText('Value'), '900000');
    await fireEvent.press(screen.getByText('Sat 24 Oct 2026'));
    await fireEvent.press(screen.getByLabelText('Sun 25 Oct'));
    expect(screen.getByText('Sat 24 Oct 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Mon 12 Oct'));
    expect(screen.getByText('Mon 12 Oct 2026')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(create).toHaveBeenCalledWith({ name: 'Home', icon: '🦘', valueCents: 90000000, asOf: '2026-10-12' });
  });
});

describe('manual account detail', () => {
  it('shows the value card, update prompt and history', async () => {
    await renderScreen(<AccountDetail />);
    expect(screen.getByText('as of 1 Jul')).toBeTruthy();
    expect(screen.getByText('Time to update')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('1 Apr')).toBeTruthy();
    expect(screen.getAllByText(/85,000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/80,000/)).toBeTruthy();
    expect(screen.queryByTestId('account-pager')).toBeNull();
  });

  it('shows the year on history dates from other years only', async () => {
    (mocked.useAccountValues as jest.Mock).mockReturnValue({
      data: { values: [{ asOf: '2026-07-01', valueCents: 8500000 }, { asOf: '2025-07-24', valueCents: 8000000 }] },
    });
    await renderScreen(<AccountDetail />);
    expect(screen.getByText('1 Jul')).toBeTruthy();
    expect(screen.getByText('24 Jul 2025')).toBeTruthy();
  });

  it('hides the update prompt when current', async () => {
    account = { ...manual, needsUpdate: false };
    await renderScreen(<AccountDetail />);
    expect(screen.queryByText('Time to update')).toBeNull();
  });

  it('Update value saves a new value as of today', async () => {
    await renderScreen(<AccountDetail />);
    await fireEvent.press(screen.getByText('Update value'));
    await fireEvent.changeText(screen.getByLabelText('Value'), '86000');
    await fireEvent.press(screen.getByText('Save'));
    expect(setValue).toHaveBeenCalledWith({ id: 7, valueCents: 8600000, asOf: '2026-10-24' });
  });

  it('shows an error when the value is blank', async () => {
    await renderScreen(<AccountDetail />);
    await fireEvent.press(screen.getByText('Update value'));
    await fireEvent.press(screen.getByText('Save'));
    expect(screen.getByText('Enter a value')).toBeTruthy();
    expect(setValue).not.toHaveBeenCalled();
  });
});

describe('CoinSpot detail', () => {
  it('masks units when balances are hidden', async () => {
    account = coinspot;
    useSettings.setState({ hideBalances: true });
    await renderScreen(<AccountDetail />);
    expect(screen.queryByText('0.0412')).toBeNull();
    expect(screen.getAllByText('\u2022\u2022\u2022').length).toBe(2);
    useSettings.setState({ hideBalances: false });
  });

  it('lists holdings with units and AUD value', async () => {
    account = coinspot;
    await renderScreen(<AccountDetail />);
    expect(screen.getByText('BTC')).toBeTruthy();
    expect(screen.getByText('0.0412')).toBeTruthy();
    expect(screen.getByText(/9,000/)).toBeTruthy();
    expect(screen.getByText('ETH')).toBeTruthy();
    expect(screen.getByText('Values from CoinSpot · updated 23 Oct 2026, 7:41am')).toBeTruthy();
    expect(screen.queryByTestId('account-pager')).toBeNull();
  });
});
