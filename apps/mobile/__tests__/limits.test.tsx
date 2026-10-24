import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import LimitsScreen from '../app/limits';
import { ApiError } from '../src/api/client';
import * as hooks from '../src/api/hooks';

const mockBack = jest.fn();
let mockNow = new Date('2026-10-24T02:00:00Z');
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: mockBack }) }));
jest.mock('../src/lib/now', () => ({ now: () => mockNow }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const limit = (o: object) => ({ id: 1, categoryId: null, amountCents: 100000, warnPercent: 80, spentCents: 0, percent: 0, level: 'ok', alertedAt: null, ...o });
const whole = limit({ id: 1, amountCents: 400000, spentCents: 328000, percent: 82, level: 'warn' });
const dining = limit({ id: 2, categoryId: 2, amountCents: 80000, spentCents: 73600, percent: 92, level: 'warn', alertedAt: '2026-10-20T01:00:00Z' });
const groceries = limit({ id: 3, categoryId: 1, amountCents: 60000, spentCents: 66000, percent: 110, level: 'over' });
const cats = [
  { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 },
  { id: 2, name: 'Dining out', emoji: '🍜', color: 'orange', kind: 'spending', sort: 2 },
  { id: 3, name: 'Transport', emoji: '🚗', color: 'yellow', kind: 'spending', sort: 3 },
  { id: 4, name: 'Salary', emoji: '💰', color: 'blue', kind: 'income', sort: 4 },
];
let limits: object[];
const create = jest.fn();
const update = jest.fn();
const del = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockNow = new Date('2026-10-24T02:00:00Z');
  limits = [whole, dining, groceries];
  create.mockResolvedValue({});
  update.mockResolvedValue({});
  del.mockResolvedValue(undefined);
  (mocked.useLimits as jest.Mock).mockImplementation(() => ({ data: { limits } }));
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: cats });
  (mocked.useCreateLimit as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false });
  (mocked.useUpdateLimit as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false });
  (mocked.useDeleteLimit as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
  (mocked.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
});

it('shows the whole-month hero and category rows', async () => {
  await renderScreen(<LimitsScreen />);
  expect(screen.getByText('Spending limits')).toBeTruthy();
  expect(screen.getByText("We'll ping you at your warning level and at 100%.")).toBeTruthy();
  expect(screen.getByText('Whole month')).toBeTruthy();
  expect(screen.getByText('82% · 7 days left')).toBeTruthy();
  expect(screen.getByText('92% · alerted 20 Oct')).toBeTruthy();
  expect(screen.getByText('CLOSE')).toBeTruthy();
  expect(screen.getByText('OVER')).toBeTruthy();
  expect(screen.getByText('110%')).toBeTruthy();
  expect(screen.getByText('dashed line = warning level')).toBeTruthy();
});

it('says 1 day left on the second-last day of the month', async () => {
  mockNow = new Date('2026-10-29T23:00:00Z'); // 30 Oct 10:00 Sydney
  await renderScreen(<LimitsScreen />);
  expect(screen.getByText('82% · 1 day left')).toBeTruthy();
});

it('offers to set a whole-month limit when there is none', async () => {
  limits = [dining];
  await renderScreen(<LimitsScreen />);
  expect(screen.getByText('+ Set a whole-month limit')).toBeTruthy();
  expect(screen.queryByText('Whole month')).toBeNull();
});

it('back goes to More', async () => {
  await renderScreen(<LimitsScreen />);
  await fireEvent.press(screen.getByText('‹ More'));
  expect(mockBack).toHaveBeenCalled();
});

async function openAdd() {
  await renderScreen(<LimitsScreen />);
  await fireEvent.press(screen.getByText('+ Add a limit'));
  await fireEvent.press(screen.getByText('Choose a category'));
}

it('the add sheet posts the new limit, offering only free spending categories', async () => {
  await openAdd();
  expect(screen.queryByText('Salary')).toBeNull();
  expect(screen.getAllByText('Groceries')).toHaveLength(1); // the row behind; not in the picker
  await fireEvent.press(screen.getByText('Transport'));
  await fireEvent.changeText(screen.getByLabelText('Limit amount'), '950');
  await fireEvent.press(screen.getByText('Save'));
  expect(create).toHaveBeenCalledWith({ categoryId: 3, amountCents: 95000, warnPercent: 80 });
});

it('rejects a zero amount', async () => {
  await openAdd();
  await fireEvent.press(screen.getByText('Transport'));
  await fireEvent.changeText(screen.getByLabelText('Limit amount'), '0');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Enter an amount above $0')).toBeTruthy();
  expect(create).not.toHaveBeenCalled();
});

it('shows the duplicate error on 409', async () => {
  create.mockRejectedValue(new ApiError(409, 'limit_exists'));
  await openAdd();
  await fireEvent.press(screen.getByText('Transport'));
  await fireEvent.changeText(screen.getByLabelText('Limit amount'), '100');
  await fireEvent.press(screen.getByText('Save'));
  expect(await screen.findByText('That category already has a limit')).toBeTruthy();
});

it('edits a limit without a category picker, and can delete it', async () => {
  await renderScreen(<LimitsScreen />);
  await fireEvent.press(screen.getByText('Dining out'));
  expect(screen.queryByText('Choose a category')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Limit amount'), '900');
  await fireEvent.press(screen.getByText('90%'));
  await fireEvent.press(screen.getByText('Save'));
  expect(update).toHaveBeenCalledWith({ id: 2, amountCents: 90000, warnPercent: 90 });
  await fireEvent.press(screen.getByText('Dining out'));
  await fireEvent.press(screen.getByText('Delete limit'));
  expect(del).toHaveBeenCalledWith(2);
});

it('sets a whole-month limit', async () => {
  limits = [dining];
  await renderScreen(<LimitsScreen />);
  await fireEvent.press(screen.getByText('+ Set a whole-month limit'));
  expect(screen.queryByText('Choose a category')).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Limit amount'), '4000');
  await fireEvent.press(screen.getByText('Save'));
  expect(create).toHaveBeenCalledWith({ categoryId: null, amountCents: 400000, warnPercent: 80 });
});
