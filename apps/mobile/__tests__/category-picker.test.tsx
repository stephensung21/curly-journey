import { fireEvent, screen } from '@testing-library/react-native';
import { CategoryPicker } from '../src/components/CategoryPicker';
import * as hooks from '../src/api/hooks';
import { ApiError } from '../src/api/client';
import type { Category } from '../src/api/types';
import { renderScreen } from '../test-utils/renderScreen';

jest.mock('../src/api/hooks');

const cats: Category[] = [
  { id: 1, name: 'Groceries', emoji: '🛒', color: 'lime', kind: 'spending', sort: 1 },
  { id: 2, name: 'Coffee', emoji: '☕', color: 'orange', kind: 'spending', sort: 2 },
  { id: 3, name: 'Transport', emoji: '🚗', color: 'yellow', kind: 'spending', sort: 3 },
];
const mutateAsync = jest.fn();
const reorder = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  pickSpy.mockClear();
  mutateAsync.mockResolvedValue({ id: 9, name: 'Pets', emoji: '🐶', color: 'line', kind: 'spending', sort: 9 });
  (hooks.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  (hooks.useReorderCategories as jest.Mock).mockReturnValue({ mutate: reorder });
});

describe('reorder', () => {
  it('moves a category with the arrows and saves the new order on Done', async () => {
    await open();
    await fireEvent.press(screen.getByText('Reorder'));
    expect(screen.queryByLabelText('Search categories')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Move Transport up'));
    await fireEvent.press(screen.getByLabelText('Move Groceries down'));
    expect(reorder).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Done'));
    expect(reorder).toHaveBeenCalledWith([3, 1, 2]);
    expect(screen.getByLabelText('Search categories')).toBeTruthy();
  });

  it('has no up arrow on the first row and no down arrow on the last', async () => {
    await open();
    await fireEvent.press(screen.getByText('Reorder'));
    expect(screen.queryByLabelText('Move Groceries up')).toBeNull();
    expect(screen.queryByLabelText('Move Transport down')).toBeNull();
  });

  it('saves nothing when the order did not change or on Cancel', async () => {
    await open();
    await fireEvent.press(screen.getByText('Reorder'));
    await fireEvent.press(screen.getByText('Done'));
    await fireEvent.press(screen.getByText('Reorder'));
    await fireEvent.press(screen.getByLabelText('Move Coffee up'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(reorder).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Groceries|Coffee|Transport/).map(n => n.props.children)).toEqual(['Groceries', 'Coffee', 'Transport']);
  });

  it('does not pick a category while reordering', async () => {
    await open();
    await fireEvent.press(screen.getByText('Reorder'));
    await fireEvent.press(screen.getByText('Coffee'));
    expect(pickSpy).not.toHaveBeenCalled();
  });
});

const pickSpy = jest.fn();
const open = (onPick = pickSpy) =>
  renderScreen(<CategoryPicker visible onClose={jest.fn()} onPick={onPick} categories={cats} />);

it('filters by name, case-insensitively', async () => {
  await open();
  await fireEvent.changeText(screen.getByLabelText('Search categories'), 'GRO');
  expect(screen.getByText('Groceries')).toBeTruthy();
  expect(screen.queryByText('Coffee')).toBeNull();
  expect(screen.queryByText('Transport')).toBeNull();
});

it('calls onPick with the category id', async () => {
  const onPick = jest.fn();
  await open(onPick);
  await fireEvent.press(screen.getByText('Coffee'));
  expect(onPick).toHaveBeenCalledWith(2);
});

it('creates a category with colour line and kind spending', async () => {
  const onPick = jest.fn();
  await open(onPick);
  await fireEvent.press(screen.getByText('+ New category'));
  await fireEvent.changeText(screen.getByLabelText('Category name'), ' Pets ');
  await fireEvent.changeText(screen.getByLabelText('Category emoji'), '🐶');
  await fireEvent.press(screen.getByText('Add category'));
  expect(mutateAsync).toHaveBeenCalledWith({ name: 'Pets', emoji: '🐶', color: 'line', kind: 'spending' });
  expect(onPick).toHaveBeenCalledWith(9);
});

it('does not create a nameless category', async () => {
  await open();
  await fireEvent.press(screen.getByText('+ New category'));
  await fireEvent.press(screen.getByText('Add category'));
  expect(mutateAsync).not.toHaveBeenCalled();
});

it('closes from the backdrop', async () => {
  const onClose = jest.fn();
  await renderScreen(<CategoryPicker visible onClose={onClose} onPick={jest.fn()} categories={cats} />);
  await fireEvent.press(screen.getByLabelText('Close'));
  expect(onClose).toHaveBeenCalled();
});

async function fillAndAdd() {
  await open();
  await fireEvent.press(screen.getByText('+ New category'));
  await fireEvent.changeText(screen.getByLabelText('Category name'), 'Pets');
  await fireEvent.press(screen.getByText('Add category'));
}

it('says so when the category already exists', async () => {
  mutateAsync.mockRejectedValue(new ApiError(409, 'category_exists'));
  await fillAndAdd();
  expect(screen.getByText('That category already exists.')).toBeTruthy();
  expect(pickSpy).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Category name').props.value).toBe('Pets');
});

it('shows a generic error when adding fails', async () => {
  mutateAsync.mockRejectedValue(new Error('network'));
  await fillAndAdd();
  expect(screen.getByText("Couldn't add category. Try again.")).toBeTruthy();
  expect(pickSpy).not.toHaveBeenCalled();
});

it('clears the error when the name changes', async () => {
  mutateAsync.mockRejectedValue(new ApiError(409, 'category_exists'));
  await fillAndAdd();
  await fireEvent.changeText(screen.getByLabelText('Category name'), 'Pets 2');
  expect(screen.queryByText('That category already exists.')).toBeNull();
});
