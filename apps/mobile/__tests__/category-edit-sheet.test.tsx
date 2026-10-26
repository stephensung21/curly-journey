import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { CategoryEditSheet } from '../src/components/CategoryEditSheet';
import * as hooks from '../src/api/hooks';
import { ApiError } from '../src/api/client';
import type { Category } from '../src/api/types';
import { renderScreen } from '../test-utils/renderScreen';

jest.mock('../src/api/hooks');

const coffee: Category = { id: 2, name: 'Coffee', emoji: '☕', color: 'orange', kind: 'spending', sort: 2 };
const cats: Category[] = [{ id: 1, name: 'Dining out', emoji: '🍜', color: 'orange', kind: 'spending', sort: 1 }, coffee];
const update = jest.fn();
const merge = jest.fn();
const del = jest.fn();
const onDeleted = jest.fn();
const onClose = jest.fn();
const onMerged = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  update.mockResolvedValue({ ...coffee, name: 'Cafés' });
  merge.mockResolvedValue({ ok: true });
  (hooks.useUpdateCategory as jest.Mock).mockReturnValue({ mutateAsync: update, isPending: false });
  (hooks.useMergeCategory as jest.Mock).mockReturnValue({ mutateAsync: merge, isPending: false });
  del.mockResolvedValue({ ok: true });
  (hooks.useDeleteCategory as jest.Mock).mockReturnValue({ mutateAsync: del, isPending: false });
  (hooks.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (hooks.useReorderCategories as jest.Mock).mockReturnValue({ mutate: jest.fn() });
});

const open = () => renderScreen(<CategoryEditSheet visible category={coffee} categories={cats} onClose={onClose} onMerged={onMerged} onDeleted={onDeleted} />);

it('saves a new name, emoji and colour', async () => {
  await open();
  await fireEvent.changeText(screen.getByLabelText('Category name'), ' Cafés ');
  await fireEvent.changeText(screen.getByLabelText('Category emoji'), '🫖');
  await fireEvent.press(screen.getByLabelText('Colour pink'));
  await fireEvent.press(screen.getByText('Save'));
  expect(update).toHaveBeenCalledWith({ id: 2, name: 'Cafés', emoji: '🫖', color: 'pink' });
  expect(onClose).toHaveBeenCalled();
});

it('says so when the name is taken', async () => {
  update.mockRejectedValue(new ApiError(409, 'category_exists'));
  await open();
  await fireEvent.changeText(screen.getByLabelText('Category name'), 'Dining out');
  await fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Another category has that name.')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

it('merges into a picked category after confirming', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.style === 'destructive')?.onPress?.());
  await open();
  await fireEvent.press(screen.getByText('Move everything to another category'));
  expect(screen.queryByText('Coffee')).toBeNull(); // a category can't merge into itself
  await fireEvent.press(screen.getByText('Dining out'));
  expect(alert.mock.calls[0]![0]).toBe('Move everything from Coffee to Dining out?');
  expect(merge).toHaveBeenCalledWith({ id: 2, into: 1 });
  expect(onMerged).toHaveBeenCalledWith(1);
});

it('deletes the category after confirming', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find(b => b.style === 'destructive')?.onPress?.());
  await open();
  await fireEvent.press(screen.getByText('Delete category'));
  expect(alert.mock.calls[0]![0]).toBe('Delete Coffee?');
  expect(del).toHaveBeenCalledWith(2);
  expect(onDeleted).toHaveBeenCalled();
});
