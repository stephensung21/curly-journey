import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import AccountsScreen from '../app/(tabs)/index';
import * as hooks from '../src/api/hooks';
import { moveItem } from '../src/lib/moveItem';
import { useSettings } from '../src/settings/store';

jest.mock('expo-router', () => ({ Link: ({ children }: { children: unknown }) => children, useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const base = {
  source: 'pocketsmith', displayName: null, balanceDate: null, countsSpending: true, countsNetWorth: true,
  projections: 'off', isOffset: false, stale: false, balanceCents: 100, kind: 'transaction', icon: null,
};
const acct = (id: number, institution: string, name: string, over: object = {}) => ({ ...base, id, institution, name, ...over });
const reorder = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useSettings.setState({ hideBalances: false, homeChart: 'sixMonths' });
  const accounts = [
    acct(1, 'Up', 'Up spend'),
    acct(2, 'CommBank', 'Everyday'),
    acct(3, 'CommBank', 'Savings', { icon: '🦄' }),
    acct(4, 'Amex', 'Amex card', { kind: 'credit_card' }),
  ];
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts, lastSuccessAt: null }, refetch: jest.fn(), isLoading: false });
  (mocked.useSyncStatus as jest.Mock).mockReturnValue({ data: { lastSuccessAt: null, lastStatus: 'ok', stale: false }, refetch: jest.fn() });
  (mocked.useSyncNow as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
  (mocked.useSpending as jest.Mock).mockReturnValue({ data: { totalCents: 0 } });
  (mocked.useLimits as jest.Mock).mockReturnValue({ data: { limits: [] } });
  (mocked.useOccurrences as jest.Mock).mockReturnValue({ data: { events: [], occurrences: [] } });
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: [] });
  (mocked.useInOut as jest.Mock).mockReturnValue({ data: [] });
  (mocked.useDaily as jest.Mock).mockReturnValue({ data: [] });
  (mocked.useReorderAccounts as jest.Mock).mockReturnValue({ mutate: reorder });
});

describe('moveItem', () => {
  it('moves forward, backward and no-ops', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate and ignores out-of-range indexes', () => {
    const src = ['a', 'b'];
    expect(moveItem(src, 0, 5)).toEqual(['a', 'b']);
    expect(moveItem(src, -1, 0)).toEqual(['a', 'b']);
    expect(moveItem(src, 0, 1)).not.toBe(src);
    expect(src).toEqual(['a', 'b']);
  });
});

it('row shows the custom icon', async () => {
  await renderScreen(<AccountsScreen />);
  expect(screen.getByText('🦄')).toBeTruthy();
});

it('Move down on the first CommBank row then Done sends the full swapped order', async () => {
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Edit order'));
  expect(screen.queryByText('Edit order')).toBeNull();
  await fireEvent.press(screen.getAllByLabelText('Move down')[0]!);
  await fireEvent.press(screen.getByText('Done'));
  expect(reorder).toHaveBeenCalledTimes(1);
  expect(reorder).toHaveBeenCalledWith([3, 2, 4, 1]);
  expect(screen.getByText('Edit order')).toBeTruthy();
});

it('first row has no Move up, last has no Move down, within a group', async () => {
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Edit order'));
  // CommBank (2 rows), Amex (1), Up (1): ups on 1 row, downs on 1 row.
  expect(screen.getAllByLabelText('Move up')).toHaveLength(1);
  expect(screen.getAllByLabelText('Move down')).toHaveLength(1);
});

it('Done without changes makes no request and exits the mode', async () => {
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Edit order'));
  await fireEvent.press(screen.getByText('Done'));
  expect(reorder).not.toHaveBeenCalled();
  expect(screen.getByText('Edit order')).toBeTruthy();
});

it('moving a row down then back up counts as no change', async () => {
  await renderScreen(<AccountsScreen />);
  await fireEvent.press(screen.getByText('Edit order'));
  await fireEvent.press(screen.getAllByLabelText('Move down')[0]!);
  await fireEvent.press(screen.getAllByLabelText('Move up')[0]!);
  await fireEvent.press(screen.getByText('Done'));
  expect(reorder).not.toHaveBeenCalled();
});
