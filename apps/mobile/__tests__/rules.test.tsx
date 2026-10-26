import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { renderScreen } from '../test-utils/renderScreen';
import Rules from '../app/rules';
import * as hooks from '../src/api/hooks';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../src/api/hooks');

const mocked = hooks as jest.Mocked<typeof hooks>;
const cats = [
  { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 0 },
  { id: 2, name: 'Eating out', emoji: '🍔', color: 'orange', kind: 'spending', sort: 1 },
];
const rule = { accountId: null, amountCents: null, flow: null, categoryId: null };
let rules: object[];
let mutate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // The categorise-by-name and edit-category sheets are mounted (hidden) on this screen.
  (mocked.useCreateRule as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useRulePreview as jest.Mock).mockReturnValue({ data: undefined });
  (mocked.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useReorderCategories as jest.Mock).mockReturnValue({ mutate: jest.fn() });
  (mocked.useUpdateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (mocked.useMergeCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  mutate = jest.fn();
  rules = [
    { ...rule, id: 1, origin: 'learned', matchText: 'OLD CAFE', categoryId: 2, createdAt: '2026-09-01T00:00:00Z', matches: 1 },
    { ...rule, id: 2, origin: 'user', matchText: 'WOOLWORTHS', categoryId: 1, createdAt: '2026-10-20T00:00:00Z', matches: 14 },
    { ...rule, id: 3, origin: 'user', matchText: 'AMEX PAYMENT', flow: 'not_spending', createdAt: '2026-10-10T00:00:00Z', matches: 3 },
    { ...rule, id: 4, origin: 'user', matchText: 'REFUNDY', categoryId: 1, flow: 'not_spending', createdAt: '2026-08-10T00:00:00Z', matches: 0 },
  ];
  mocked.useRules.mockImplementation(() => ({ data: rules }) as never);
  mocked.useCategories.mockReturnValue({ data: cats } as never);
  mocked.useDeleteRule.mockReturnValue({ mutate } as never);
});

it('renders rule rows newest first', async () => {
  await renderScreen(<Rules />);
  const texts = screen.getAllByTestId('rule-match').map(n => n.props.children);
  expect(texts).toEqual(['WOOLWORTHS', 'AMEX PAYMENT', 'OLD CAFE', 'REFUNDY']);
  expect(screen.getByText('🛒 Groceries')).toBeTruthy();
  expect(screen.getByText('Not spending')).toBeTruthy();
  expect(screen.getByText('🛒 Groceries · not spending')).toBeTruthy();
  expect(screen.getAllByText('you made this')).toHaveLength(3);
  expect(screen.getByText('learned')).toBeTruthy();
  expect(screen.getByText('14 matches')).toBeTruthy();
  expect(screen.getByText('1 match')).toBeTruthy();
});

it('deletes only after confirming', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await renderScreen(<Rules />);
  await fireEvent.press(screen.getByLabelText('Delete rule WOOLWORTHS'));
  expect(mutate).not.toHaveBeenCalled();
  expect(alert).toHaveBeenCalledWith('Delete this rule?', 'Past transactions keep their category.', expect.any(Array));
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map(b => b.text)).toEqual(['Cancel', 'Delete']);
  buttons[1].onPress!();
  expect(mutate).toHaveBeenCalledWith(2);
});

it('shows the empty state', async () => {
  rules = [];
  await renderScreen(<Rules />);
  expect(screen.getByText('No rules yet. Recategorise a transaction and choose "Always" to make one.')).toBeTruthy();
});

it('opens categorise by name', async () => {
  await renderScreen(<Rules />);
  await fireEvent.press(screen.getByText('Categorise by name'));
  expect(screen.getByLabelText('Name contains')).toBeTruthy();
});
