import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import TransactionDetail from '../app/transaction/[id]';
import AccountDetail from '../app/account/[id]';
import * as hooks from '../src/api/hooks';

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: { id: string } = { id: '5' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('../src/lib/now', () => ({ now: () => new Date('2026-10-22T02:00:00Z') }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const base = {
  id: 5, accountId: 7, date: '2026-10-22', amountCents: -1000, description: 'WOOLWORTHS 1234 SYDNEY NSW AUS CARD 4321',
  merchant: 'Woolworths', status: 'posted', source: 'pocketsmith', categoryId: null, categorySource: null, flow: 'normal',
  flowSource: 'auto', note: null, memo: 'Weekly shop', feedCreatedAt: '2026-10-21T20:41:00Z', splits: [],
};
const categories = [
  { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 },
  { id: 2, name: 'Eating out', emoji: '🍔', color: 'orange', kind: 'spending', sort: 2 },
];
const account = { id: 7, name: 'Everyday', displayName: 'Daily', kind: 'transaction' };
let txn: object;
let preview: number;
const update = jest.fn();
const setSplits = jest.fn();
const createRule = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '5' };
  txn = base;
  preview = 3;
  update.mockResolvedValue({});
  setSplits.mockResolvedValue({});
  createRule.mockResolvedValue({});
  (mocked.useTransaction as jest.Mock).mockImplementation(() => ({ data: txn, isLoading: false }));
  (mocked.useCategories as jest.Mock).mockReturnValue({ data: categories });
  (mocked.useAccounts as jest.Mock).mockReturnValue({ data: { accounts: [account], lastSuccessAt: null } });
  (mocked.useUpdateTransaction as jest.Mock).mockReturnValue({ mutateAsync: update });
  (mocked.useSetSplits as jest.Mock).mockReturnValue({ mutateAsync: setSplits });
  (mocked.useCreateRule as jest.Mock).mockReturnValue({ mutateAsync: createRule });
  (mocked.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
  (mocked.useRulePreview as jest.Mock).mockImplementation((_p: unknown, enabled: boolean) => ({
    data: enabled ? { matches: preview } : undefined,
  }));
});

async function pickGroceries() {
  await fireEvent.press(screen.getByText('Choose category'));
  await fireEvent.press(screen.getByText('Groceries'));
}

it('shows the details card', async () => {
  txn = { ...base, categoryId: 1 };
  await renderScreen(<TransactionDetail />);
  expect(screen.getAllByText(base.description).length).toBeGreaterThan(0);
  expect(screen.getByText('Weekly shop')).toBeTruthy();
  expect(screen.getAllByText(/Groceries/).length).toBeGreaterThan(0);
  expect(screen.getByText('Thu 22 Oct 2026')).toBeTruthy();
  expect(screen.getByText('22 Oct 2026, 7:41am')).toBeTruthy();
  expect(screen.getByText("When the bank feed delivered it. Banks don't share the exact time.")).toBeTruthy();
  expect(screen.getByText('Daily')).toBeTruthy();
  expect(screen.getByText('Posted')).toBeTruthy();
});

it('hides Received and Description when empty, shows Uncategorised', async () => {
  txn = { ...base, feedCreatedAt: null, memo: '' };
  await renderScreen(<TransactionDetail />);
  expect(screen.queryByText('Received')).toBeNull();
  expect(screen.queryByText('Description')).toBeNull();
  expect(screen.getByText('Uncategorised')).toBeTruthy();
});

it('picking a category updates then offers to remember', async () => {
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  expect(update).toHaveBeenCalledWith({ id: 5, patch: { categoryId: 1 } });
  expect(mocked.useRulePreview).toHaveBeenLastCalledWith({ matchText: 'Woolworths', categoryId: 1 }, true);
  expect(screen.getByText('Always put Woolworths in Groceries')).toBeTruthy();
  expect(screen.getByText('Also update 3 earlier Woolworths transactions')).toBeTruthy();
  expect(screen.getByText('nice, one less to sort')).toBeTruthy();
});

it('hides the earlier-transactions toggle when none match', async () => {
  preview = 0;
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  expect(screen.queryByText(/earlier/)).toBeNull();
});

it('Done with defaults creates a learned rule applied to the past', async () => {
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  await fireEvent.press(screen.getByText('Done'));
  expect(createRule).toHaveBeenCalledWith({ origin: 'learned', matchText: 'Woolworths', categoryId: 1, applyToPast: true });
});

it('turning off the first toggle creates no rule', async () => {
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  await fireEvent(screen.getByLabelText('Always put Woolworths in Groceries'), 'valueChange', false);
  await fireEvent.press(screen.getByText('Done'));
  expect(createRule).not.toHaveBeenCalled();
});

it('falls back to the raw description when the merchant is too short', async () => {
  txn = { ...base, merchant: 'AB' };
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  await fireEvent.press(screen.getByText('Done'));
  expect(createRule).toHaveBeenCalledWith(expect.objectContaining({ matchText: base.description }));
});

it('labels sheets with what the rule matches when the merchant is short', async () => {
  txn = { ...base, merchant: 'AB' };
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  expect(screen.getByText(`Always put ${base.description} in Groceries`)).toBeTruthy();
});

it('keeps Back in the error state', async () => {
  (mocked.useTransaction as jest.Mock).mockReturnValue({ data: undefined, isError: true });
  await renderScreen(<TransactionDetail />);
  await fireEvent.press(screen.getByLabelText('Back'));
  expect(mockBack).toHaveBeenCalled();
});

it('shows a plain error when saving the category fails', async () => {
  update.mockRejectedValue(new Error('x'));
  await renderScreen(<TransactionDetail />);
  await pickGroceries();
  expect(screen.getByText("Couldn't save. Try again.")).toBeTruthy();
  expect(screen.queryByText('nice, one less to sort')).toBeNull();
});

it('Mortgage updates the flow', async () => {
  await renderScreen(<TransactionDetail />);
  await fireEvent.press(screen.getByText('Mortgage'));
  expect(update).toHaveBeenCalledWith({ id: 5, patch: { flow: 'mortgage' } });
});

it('Not spending offers a learned rule', async () => {
  await renderScreen(<TransactionDetail />);
  await fireEvent.press(screen.getByText('Not spending'));
  expect(update).toHaveBeenCalledWith({ id: 5, patch: { flow: 'not_spending' } });
  expect(screen.getByText('Always treat Woolworths as not spending')).toBeTruthy();
  await fireEvent.press(screen.getByText('Done'));
  expect(createRule).toHaveBeenCalledWith({ origin: 'learned', matchText: 'Woolworths', flow: 'not_spending', applyToPast: false });
});

it('saves the note on blur', async () => {
  await renderScreen(<TransactionDetail />);
  const input = screen.getByLabelText('Note');
  await fireEvent.changeText(input, 'for the party');
  await fireEvent(input, 'blur');
  expect(update).toHaveBeenCalledWith({ id: 5, patch: { note: 'for the party' } });
});

describe('split editor', () => {
  async function openSplit() {
    await fireEvent.press(screen.getByText('Split'));
  }
  async function pickPart(n: number, name: string) {
    await fireEvent.press(screen.getByLabelText(`Part ${n} category`));
    await fireEvent.press(screen.getAllByText(name).slice(-1)[0]!);
  }

  it('enables Save only when everything is assigned, then saves cents', async () => {
    await renderScreen(<TransactionDetail />);
    await openSplit();
    expect(screen.getByText('$10.00 left to assign')).toBeTruthy();
    await pickPart(1, 'Groceries');
    await pickPart(2, 'Eating out');
    await fireEvent.changeText(screen.getByLabelText('Part 1 amount'), '6.5');
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).not.toHaveBeenCalled();
    expect(screen.getByText('$3.50 left to assign')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Part 2 amount'), '3.50');
    expect(screen.getByText('$0.00 left to assign')).toBeTruthy();
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).toHaveBeenCalledWith({
      id: 5,
      splits: [{ categoryId: 1, amountCents: -650 }, { categoryId: 2, amountCents: -350 }],
    });
  });

  it('accepts a leading minus and rejects junk', async () => {
    await renderScreen(<TransactionDetail />);
    await openSplit();
    await pickPart(1, 'Groceries');
    await pickPart(2, 'Eating out');
    await fireEvent.changeText(screen.getByLabelText('Part 1 amount'), '-4');
    await fireEvent.changeText(screen.getByLabelText('Part 2 amount'), 'abc');
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Part 2 amount'), '6');
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).toHaveBeenCalledTimes(1);
  });

  it('disables Save visibly and explains why', async () => {
    await renderScreen(<TransactionDetail />);
    await openSplit();
    const save = () => screen.getByRole('button', { name: 'Save' });
    expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).not.toHaveBeenCalled();
    expect(screen.getByText('Pick a category for every part.')).toBeTruthy();
    await pickPart(1, 'Groceries');
    await pickPart(2, 'Eating out');
    expect(screen.queryByText('Pick a category for every part.')).toBeNull();
    expect(screen.getByText('Amounts must be numbers above $0.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Part 1 amount'), '4');
    await fireEvent.changeText(screen.getByLabelText('Part 2 amount'), '6');
    expect(screen.queryByText('Amounts must be numbers above $0.')).toBeNull();
    expect(save().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it('removing an extra part re-enables Save', async () => {
    await renderScreen(<TransactionDetail />);
    await openSplit();
    expect(screen.queryByLabelText('Remove part 1')).toBeNull();
    await pickPart(1, 'Groceries');
    await pickPart(2, 'Eating out');
    await fireEvent.changeText(screen.getByLabelText('Part 1 amount'), '4');
    await fireEvent.changeText(screen.getByLabelText('Part 2 amount'), '6');
    await fireEvent.press(screen.getByText('+ Add part'));
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    await fireEvent.press(screen.getByLabelText('Remove part 3'));
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    await fireEvent.press(screen.getByText('Save'));
    expect(setSplits).toHaveBeenCalledTimes(1);
  });

  it('Remove split clears the splits', async () => {
    txn = { ...base, splits: [{ categoryId: 1, amountCents: -600 }, { categoryId: 2, amountCents: -400 }] };
    await renderScreen(<TransactionDetail />);
    await openSplit();
    await fireEvent.press(screen.getByText('Remove split'));
    expect(setSplits).toHaveBeenCalledWith({ id: 5, splits: [] });
  });
});

it('account detail rows open the transaction', async () => {
  (mocked.useTransactions as jest.Mock).mockReturnValue({ data: { transactions: [{ ...base, merchant: 'Coffee' }] }, isLoading: false });
  await renderScreen(<AccountDetail />);
  await fireEvent.press(screen.getByText('Coffee'));
  expect(mockPush).toHaveBeenCalledWith('/transaction/5');
});
