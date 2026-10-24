import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import MoreScreen from '../app/(tabs)/more';
import * as hooks from '../src/api/hooks';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const occ = (date: string, status: 'paid' | 'skipped' | null) => ({ eventId: 1, date, status, source: null, transactionId: null, payable: true });
const limit = (categoryId: number | null) => ({ id: categoryId ?? 0, categoryId, amountCents: 1000, warnPercent: 80, spentCents: 0, percent: 0, level: 'ok', alertedAt: null });

let occurrences: object[];
let limits: object[];
let autoPercent: number | undefined;
let commsecValue: number | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  occurrences = [occ('2026-10-22', null), occ('2026-10-28', null), occ('2026-10-23', 'paid'), occ('2026-10-29', null)];
  limits = [limit(null), limit(1), limit(2), limit(3)];
  autoPercent = 93;
  commsecValue = 8490000;
  mocked.useOccurrences.mockImplementation((() => ({ data: { events: [], occurrences } })) as any);
  mocked.useLimits.mockImplementation((() => ({ data: { limits } })) as any);
  mocked.useCommsec.mockImplementation((() => ({ data: commsecValue === undefined ? { accountId: null, valueCents: 0, holdings: [], trades: [] } : { accountId: 9, valueCents: commsecValue, holdings: [], trades: [] } })) as any);
  mocked.useCategorisationStats.mockImplementation((() => ({ data: autoPercent === undefined ? undefined : { autoPercent } })) as any);
});

it('shows grouped rows with sublines', async () => {
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('More')).toBeTruthy();
  for (const t of ['Money settings', 'App', 'Bills & dates', 'Import', 'Spending limits', 'Rules', 'Add super or home value', 'Notifications', 'Settings', 'Design system']) {
    expect(screen.getByText(t)).toBeTruthy();
  }
  expect(screen.getByText('2 coming up this week')).toBeTruthy();
  expect(screen.getByText('CommBank or Amex CSV')).toBeTruthy();
  expect(screen.getByText('Monthly + 3 categories')).toBeTruthy();
  expect(screen.getByText('93% auto-sorted')).toBeTruthy();
});

it('navigates each row to its route', async () => {
  await renderScreen(<MoreScreen />);
  const routes: [string, string][] = [
    ['Bills & dates', '/calendar'], ['Import', '/import'], ['Spending limits', '/limits'], ['Rules', '/rules'],
    ['Add super or home value', '/account/new'], ['Notifications', '/notifications'], ['Settings', '/settings'], ['Design system', '/design-system'],
  ];
  for (const [label, route] of routes) {
    mockPush.mockClear();
    await fireEvent.press(screen.getByText(label));
    expect(mockPush).toHaveBeenCalledWith(route);
  }
});

it('handles empty states', async () => {
  occurrences = [];
  limits = [];
  autoPercent = undefined;
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('Nothing this week')).toBeTruthy();
  expect(screen.getByText('None set')).toBeTruthy();
  expect(screen.queryByText(/auto-sorted/)).toBeNull();
});

it('words limit sublines for monthly only', async () => {
  limits = [limit(null)];
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('Monthly')).toBeTruthy();
});

it('words limit sublines for one category', async () => {
  limits = [limit(1)];
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('1 category')).toBeTruthy();
});

it('shows the CommSec row with its value and opens it', async () => {
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('CommSec')).toBeTruthy();
  expect(screen.getByText('$84,900.00')).toBeTruthy();
  mockPush.mockClear();
  await fireEvent.press(screen.getByText('CommSec'));
  expect(mockPush).toHaveBeenCalledWith('/commsec');
});

it('shows the About you and Home loan rows and opens them', async () => {
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('Birth date and tax rate')).toBeTruthy();
  expect(screen.getByText('Rate, repayment and term')).toBeTruthy();
  for (const [label, route] of [['About you', '/about-you'], ['Home loan', '/home-loan']] as const) {
    mockPush.mockClear();
    await fireEvent.press(screen.getByText(label));
    expect(mockPush).toHaveBeenCalledWith(route);
  }
});

it('invites an import when there is no CommSec account', async () => {
  commsecValue = undefined;
  await renderScreen(<MoreScreen />);
  expect(screen.getByText('Import your trades')).toBeTruthy();
});
