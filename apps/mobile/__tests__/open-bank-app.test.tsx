import { fireEvent, screen } from '@testing-library/react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking } from 'react-native';
import AccountsScreen from '../app/(tabs)/index';
import AccountDetail from '../app/account/[id]';
import * as hooks from '../src/api/hooks';
import { BANK_APPS, bankAppFor, openBankApp } from '../src/lib/bankApps';
import { useSettings } from '../src/settings/store';
import { renderScreen } from '../test-utils/renderScreen';

const withBankAppQueries = require('../plugins/withBankAppQueries');

jest.mock('expo-intent-launcher', () => ({ openApplication: jest.fn() }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  Link: ({ children }: { children: unknown }) => children,
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const open = IntentLauncher.openApplication as jest.Mock;
const base = {
  id: 7, source: 'pocketsmith', name: 'Everyday', displayName: null, kind: 'transaction', balanceCents: 1000, balanceDate: null,
  countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false,
};
let institution: string;

beforeEach(() => {
  jest.clearAllMocks();
  institution = 'CommBank';
  useSettings.setState({ hideBalances: false, homeChart: 'sixMonths' });
  (mocked.useAccounts as jest.Mock).mockImplementation(() => ({
    data: { accounts: [{ ...base, institution }], lastSuccessAt: null }, refetch: jest.fn(), isLoading: false,
  }));
  (mocked.useTransactionsQuery as jest.Mock).mockReturnValue({ data: { transactions: [] }, isLoading: false });
  (mocked.useSpending as jest.Mock).mockReturnValue({ data: { totalCents: 0, prevTotalCents: 0, byCategory: [] } });
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: [] });
  (mocked.useSyncStatus as jest.Mock).mockReturnValue({ data: { lastSuccessAt: null, lastStatus: 'ok' }, refetch: jest.fn() });
  (mocked.useSyncNow as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
  (mocked.useInOut as jest.Mock).mockReturnValue({ data: [] });
  (mocked.useDaily as jest.Mock).mockReturnValue({ data: [] });
  open.mockResolvedValue(undefined);
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
});

describe('bankAppFor', () => {
  it('maps institution names via institutionGroup', () => {
    expect(bankAppFor('Commonwealth Bank of Australia')?.androidPackage).toBe('com.commbank.netbank');
    expect(bankAppFor('American Express')?.androidPackage).toBe('com.americanexpress.android.acctsvcs.au');
    expect(bankAppFor('Up Bank')?.androidPackage).toBe('au.com.up.money');
    expect(bankAppFor('ING')).toBeNull();
  });
});

describe('openBankApp', () => {
  const app = BANK_APPS.CommBank;
  it('launches the installed app', async () => {
    await openBankApp(app);
    expect(open).toHaveBeenCalledWith('com.commbank.netbank');
    expect(Linking.openURL).not.toHaveBeenCalled();
  });
  it('falls back to the market URL', async () => {
    open.mockRejectedValue(new Error('not installed'));
    await openBankApp(app);
    expect(Linking.openURL).toHaveBeenCalledWith('market://details?id=com.commbank.netbank');
  });
  it('falls back to the Play Store web URL', async () => {
    open.mockRejectedValue(new Error('not installed'));
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no market'));
    await openBankApp(app);
    expect(Linking.openURL).toHaveBeenLastCalledWith('https://play.google.com/store/apps/details?id=com.commbank.netbank');
  });
});

describe('account detail', () => {
  it('opens the bank app', async () => {
    await renderScreen(<AccountDetail />);
    await fireEvent.press(screen.getByText('Open CommBank app ↗'));
    expect(open).toHaveBeenCalledWith('com.commbank.netbank');
  });
  it('shows no button for unknown institutions', async () => {
    institution = 'ING';
    await renderScreen(<AccountDetail />);
    expect(screen.queryByText(/Open .* app/)).toBeNull();
  });
});

describe('accounts tab', () => {
  it('has an open-app target on matched headers only', async () => {
    await renderScreen(<AccountsScreen />);
    await fireEvent.press(screen.getByLabelText('Open CommBank app'));
    expect(open).toHaveBeenCalledWith('com.commbank.netbank');
  });
  it('omits it for unknown institutions', async () => {
    institution = 'ING';
    await renderScreen(<AccountsScreen />);
    expect(screen.queryByLabelText(/^Open .* app$/)).toBeNull();
  });
});

describe('withBankAppQueries', () => {
  const pkgs = (m: any) => (m.manifest.queries ?? []).flatMap((q: any) => (q.package ?? []).map((p: any) => p.$['android:name']));
  it('adds one package query per bank app', () => {
    const m: any = { manifest: {} };
    withBankAppQueries.addBankAppQueries(m);
    expect(pkgs(m).sort()).toEqual(Object.values(BANK_APPS).map(b => b.androidPackage).sort());
  });
  it('is idempotent and keeps existing queries', () => {
    const m: any = { manifest: { queries: [{ intent: [{ action: [] }], package: [{ $: { 'android:name': 'x.y' } }] }] } };
    withBankAppQueries.addBankAppQueries(m);
    withBankAppQueries.addBankAppQueries(m);
    expect(pkgs(m)).toHaveLength(4);
    expect(pkgs(m)).toContain('x.y');
    expect(m.manifest.queries[0].intent).toBeDefined();
  });
  it('keeps its package list in sync with bankApps.ts', () => {
    expect([...withBankAppQueries.BANK_PACKAGES].sort()).toEqual(Object.values(BANK_APPS).map(b => b.androidPackage).sort());
  });
});
