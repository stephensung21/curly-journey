import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import Inbox from '../app/inbox';
import * as hooks from '../src/api/hooks';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../src/api/hooks');
// Records each Button's onPress as rendered, so a test can fire one render's handler twice in the same tick.
const pressHandlers: Record<string, () => void> = {};
jest.mock('../src/components/Button', () => {
  const actual = jest.requireActual('../src/components/Button');
  return {
    Button: (props: { label: string; onPress?: () => void }) => {
      if (props.onPress) pressHandlers[props.label] = props.onPress;
      return actual.Button(props);
    },
  };
});

const mocked = hooks as jest.Mocked<typeof hooks>;
const base = {
  accountId: 7, categoryId: null, categorySource: null, flow: 'normal', flowSource: 'auto', note: null, memo: null,
  feedCreatedAt: null, splits: [], status: 'posted', source: 'pocketsmith',
};
const cats = [
  { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 0 },
  { id: 2, name: 'Eating out', emoji: '🍔', color: 'orange', kind: 'spending', sort: 1 },
  { id: 3, name: 'Fuel', emoji: '⛽', color: 'blue', kind: 'spending', sort: 2 },
];
let items: object[];
let mutateAsync: jest.Mock;
let stats: { autoPercent: number | null; sample: number };

beforeEach(() => {
  jest.clearAllMocks();
  items = [
    { ...base, id: 10, date: '2026-10-22', amountCents: -4520, description: 'WOOLWORTHS 1234', merchant: 'Woolworths', guesses: [1, 2] },
    { ...base, id: 11, date: '2026-10-21', amountCents: -1200, description: 'MYSTERY CAFE', merchant: 'Mystery Cafe', guesses: [] },
    { ...base, id: 12, date: '2026-10-20', amountCents: -900, description: 'BP 77', merchant: 'BP', guesses: [3] },
  ];
  stats = { autoPercent: 92, sample: 50 };
  mutateAsync = jest.fn().mockResolvedValue({});
  (mocked.useInbox as jest.Mock).mockImplementation(() => ({ data: { items, total: items.length }, isLoading: false }));
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: cats });
  (mocked.useCategorisationStats as jest.Mock).mockImplementation(() => ({ data: stats }));
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts: [{ id: 7, name: 'Everyday', displayName: null }] } });
  (mocked.useUpdateTransaction as jest.Mock).mockReturnValue({ mutateAsync });
});

it('shows the top card and header', async () => {
  await renderScreen(<Inbox />);
  expect(screen.getByText('Sort 3')).toBeTruthy();
  expect(screen.getByText('Woolworths')).toBeTruthy();
  expect(screen.getByText('WOOLWORTHS 1234')).toBeTruthy();
  expect(screen.getByText('Thu 22 Oct 2026')).toBeTruthy();
  expect(screen.getByText('Everyday')).toBeTruthy();
});

it('Use <top guess> updates with the first guess and advances', async () => {
  await renderScreen(<Inbox />);
  await fireEvent.press(screen.getByText('Use Groceries'));
  expect(mutateAsync).toHaveBeenCalledWith({ id: 10, patch: { categoryId: 1 } });
  expect(screen.getByText('Mystery Cafe')).toBeTruthy();
  expect(screen.getByText('Sort 2')).toBeTruthy();
});

it('Skip moves the card to the end', async () => {
  await renderScreen(<Inbox />);
  await fireEvent.press(screen.getByText('Skip'));
  expect(screen.getByText('Mystery Cafe')).toBeTruthy();
  expect(mutateAsync).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Skip'));
  await fireEvent.press(screen.getByText('Skip'));
  expect(screen.getByText('Woolworths')).toBeTruthy();
  expect(screen.getByText('Sort 3')).toBeTruthy();
});

it('tapping the second pill uses that category', async () => {
  await renderScreen(<Inbox />);
  await fireEvent.press(screen.getByText('🍔 Eating out'));
  expect(mutateAsync).toHaveBeenCalledWith({ id: 10, patch: { categoryId: 2 } });
});

it('no guesses: no pills and no Use button, Skip and More remain', async () => {
  items = [items[1]!];
  await renderScreen(<Inbox />);
  expect(screen.queryByText(/^Use /)).toBeNull();
  expect(screen.getByText('Skip')).toBeTruthy();
  expect(screen.getByText('More categories')).toBeTruthy();
});

it('More categories opens the picker and picking accepts', async () => {
  await renderScreen(<Inbox />);
  await fireEvent.press(screen.getByText('More categories'));
  await fireEvent.press(screen.getByText('Fuel'));
  expect(mutateAsync).toHaveBeenCalledWith({ id: 10, patch: { categoryId: 3 } });
});

it('failed update puts the card back with a message', async () => {
  mutateAsync.mockRejectedValue(new Error('x'));
  await renderScreen(<Inbox />);
  await fireEvent.press(screen.getByText('Use Groceries'));
  expect(screen.getByText("Couldn't save. Try again.")).toBeTruthy();
  expect(screen.getByText('Woolworths')).toBeTruthy();
  expect(screen.getByText('Sort 3')).toBeTruthy();
});

it('empty inbox shows All sorted with the percentage', async () => {
  items = [];
  await renderScreen(<Inbox />);
  expect(screen.getByText('All sorted!')).toBeTruthy();
  expect(screen.getByText('92% sorted automatically this month')).toBeTruthy();
});

it('empty inbox hides the percentage when null', async () => {
  items = [];
  stats = { autoPercent: null, sample: 0 };
  await renderScreen(<Inbox />);
  expect(screen.getByText('All sorted!')).toBeTruthy();
  expect(screen.queryByText(/sorted automatically/)).toBeNull();
});

it('ignores a second accept on a card while its update is pending', async () => {
  let resolve!: (v: object) => void;
  mutateAsync.mockReturnValue(new Promise(r => { resolve = r; }));
  await renderScreen(<Inbox />);
  // Same render, same closure: what a fast double tap does before React re-renders.
  const use = pressHandlers['Use Groceries']!;
  await act(async () => { use(); use(); });
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Sort 2')).toBeTruthy();
  expect(screen.getByText('Mystery Cafe')).toBeTruthy();
  await act(async () => { resolve({}); });
});
