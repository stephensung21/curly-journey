import { fireEvent, screen } from '@testing-library/react-native';
import { BulkCategoriseSheet } from '../src/components/BulkCategoriseSheet';
import * as hooks from '../src/api/hooks';
import type { Category } from '../src/api/types';
import { renderScreen } from '../test-utils/renderScreen';

jest.mock('../src/api/hooks');

const cats: Category[] = [
  { id: 1, name: 'Dining out', emoji: '🍜', color: 'orange', kind: 'spending', sort: 1 },
  { id: 2, name: 'Gifts & donations', emoji: '🎁', color: 'pink', kind: 'spending', sort: 2 },
];
const create = jest.fn();
const onClose = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  create.mockResolvedValue({ rule: {}, updated: 12 });
  (hooks.useCreateRule as jest.Mock).mockReturnValue({ mutateAsync: create, isPending: false });
  (hooks.useRulePreview as jest.Mock).mockImplementation((p: { matchText: string }, enabled: boolean) => ({ data: enabled && p.matchText.toLowerCase() === 'beem' ? { matches: 12 } : undefined }));
  (hooks.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (hooks.useReorderCategories as jest.Mock).mockReturnValue({ mutate: jest.fn() });
});

it('puts every transaction whose name contains the text in a category, past ones too', async () => {
  await renderScreen(<BulkCategoriseSheet visible initialText=" beem " categories={cats} onClose={onClose} />);
  expect(screen.getByLabelText('Name contains').props.value).toBe('beem');
  await fireEvent.press(screen.getByText('Choose a category'));
  await fireEvent.press(screen.getByText('Gifts & donations'));
  expect(screen.getByText('12 earlier transactions match')).toBeTruthy();
  await fireEvent.press(screen.getByText('Categorise'));
  expect(create).toHaveBeenCalledWith({ origin: 'user', matchText: 'beem', categoryId: 2, applyToPast: true });
  expect(screen.getByText('Done: 12 transactions moved to Gifts & donations. New ones will follow.')).toBeTruthy();
});

it('can leave past transactions alone', async () => {
  await renderScreen(<BulkCategoriseSheet visible initialText="beem" categories={cats} onClose={onClose} />);
  await fireEvent.press(screen.getByText('Choose a category'));
  await fireEvent.press(screen.getByText('Dining out'));
  await fireEvent(screen.getByLabelText('Also change the 12 earlier ones'), 'valueChange', false);
  await fireEvent.press(screen.getByText('Categorise'));
  expect(create).toHaveBeenCalledWith({ origin: 'user', matchText: 'beem', categoryId: 1, applyToPast: false });
});

it('needs at least 3 letters and a category', async () => {
  await renderScreen(<BulkCategoriseSheet visible initialText="be" categories={cats} onClose={onClose} />);
  expect(screen.getByText('Type at least 3 letters.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Categorise'));
  expect(create).not.toHaveBeenCalled();
});

it('can also change ones sorted by hand, but only when asked', async () => {
  (hooks.useRulePreview as jest.Mock).mockImplementation((_p: unknown, enabled: boolean) => ({ data: enabled ? { matches: 12, handSorted: 3 } : undefined }));
  await renderScreen(<BulkCategoriseSheet visible initialText="beem" categories={cats} onClose={onClose} />);
  await fireEvent.press(screen.getByText('Choose a category'));
  await fireEvent.press(screen.getByText('Dining out'));
  const hand = screen.getByLabelText('Also change the 3 you sorted by hand');
  expect(hand.props.value).toBe(false);
  await fireEvent(hand, 'valueChange', true);
  expect(screen.getByText('New transactions with this in their name will go here too. Ones you sorted by hand change too.')).toBeTruthy();
  await fireEvent.press(screen.getByText('Categorise'));
  expect(create).toHaveBeenCalledWith({ origin: 'user', matchText: 'beem', categoryId: 1, applyToPast: true, includeHandSorted: true });
});
