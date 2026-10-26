import type { CategoryColor } from '@curly/core';
import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { useDeleteCategory, useMergeCategory, useUpdateCategory } from '../api/hooks';
import type { Category } from '../api/types';
import { categoryColor } from '../theme/categoryColor';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Sheet } from './Sheet';

const COLORS: CategoryColor[] = ['orange', 'lime', 'blue', 'yellow', 'pink', 'purple', 'line'];

/** Rename or restyle a category (name, emoji, tile colour), move everything in it to another category, or delete it. */
export function CategoryEditSheet({
  visible,
  category,
  categories,
  onClose,
  onMerged,
  onDeleted,
}: {
  visible: boolean;
  category: Category;
  categories: Category[];
  onClose: () => void;
  /** Called with the category everything moved to; this one no longer exists. */
  onMerged: (into: number) => void;
  /** Called once the category is deleted. */
  onDeleted: () => void;
}) {
  const t = useTheme();
  const update = useUpdateCategory();
  const merge = useMergeCategory();
  const del = useDeleteCategory();
  const [name, setName] = useState(category.name);
  const [emoji, setEmoji] = useState(category.emoji);
  const [color, setColor] = useState<CategoryColor>(category.color);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(category.name);
    setEmoji(category.emoji);
    setColor(category.color);
    setError(null);
  }, [visible, category]);

  const input = {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || !emoji.trim()) return setError('A category needs a name and an emoji.');
    try {
      await update.mutateAsync({ id: category.id, name: trimmed, emoji: emoji.trim(), color });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'Another category has that name.' : "Couldn't save. Try again.");
      return;
    }
    onClose();
  }

  function confirmMerge(into: number) {
    setPicking(false);
    const target = categories.find(c => c.id === into);
    if (!target) return;
    Alert.alert(
      `Move everything from ${category.name} to ${target.name}?`,
      `Its transactions, rules and limit move to ${target.name}, and ${category.name} is deleted. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          style: 'destructive',
          onPress: async () => {
            try {
              await merge.mutateAsync({ id: category.id, into });
            } catch {
              setError("Couldn't move. Try again.");
              return;
            }
            onMerged(into);
          },
        },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert(
      `Delete ${category.name}?`,
      `Its transactions become uncategorised, and its rules and limit are removed. To keep them, use Move everything instead. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await del.mutateAsync(category.id);
            } catch {
              setError("Couldn't delete. Try again.");
              return;
            }
            onDeleted();
          },
        },
      ],
    );
  }

  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose}>
        <AppText variant="bodyStrong">Edit category</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            accessibilityLabel="Category emoji"
            value={emoji}
            onChangeText={setEmoji}
            maxLength={8}
            style={[input, { width: 56, textAlign: 'center' }]}
          />
          <TextInput
            accessibilityLabel="Category name"
            value={name}
            onChangeText={v => {
              setName(v);
              setError(null);
            }}
            maxLength={40}
            style={[input, { flex: 1 }]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {COLORS.map(c => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Colour ${c}`}
              accessibilityState={{ selected: color === c }}
              hitSlop={4}
              onPress={() => setColor(c)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: categoryColor(c, t),
                borderWidth: color === c ? 3 : 0,
                borderColor: t.ink,
              }}
            />
          ))}
        </View>
        {error ? <AppText tone="muted">{error}</AppText> : null}
        <Button label="Save" onPress={() => void save()} disabled={update.isPending} />
        <Button kind="secondary" label="Move everything to another category" onPress={() => setPicking(true)} disabled={merge.isPending} />
        <Button kind="secondary" label="Delete category" onPress={confirmDelete} disabled={del.isPending} />
      </Sheet>
      <CategoryPicker
        visible={visible && picking}
        onClose={() => setPicking(false)}
        onPick={confirmMerge}
        categories={categories.filter(c => c.id !== category.id)}
      />
    </>
  );
}
