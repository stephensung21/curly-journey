import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { useCreateCategory } from '../api/hooks';
import type { Category } from '../api/types';
import { categoryColor } from '../theme/categoryColor';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { IconTile } from './IconTile';
import { Sheet } from './Sheet';

/** Pick a category from a searchable emoji grid, or add a new one. */
export function CategoryPicker({
  visible,
  onClose,
  onPick,
  categories,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (categoryId: number) => void;
  categories: Category[];
}) {
  const t = useTheme();
  const create = useCreateCategory();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏷️');
  const [error, setError] = useState<string | null>(null);

  const needle = search.trim().toLowerCase();
  const shown = categories.filter(c => c.name.toLowerCase().includes(needle));
  const canAdd = name.trim().length > 0 && emoji.trim().length > 0;

  const input = {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;

  async function add() {
    let created;
    try {
      created = await create.mutateAsync({ name: name.trim(), emoji: emoji.trim(), color: 'line', kind: 'spending' });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'That category already exists.' : "Couldn't add category. Try again.");
      return;
    }
    setAdding(false);
    setName('');
    if (created) onPick(created.id);
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <TextInput
        accessibilityLabel="Search categories"
        placeholder="Search categories"
        placeholderTextColor={t.inkFaded}
        value={search}
        onChangeText={setSearch}
        style={input}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {shown.map(c => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => onPick(c.id)}
              style={{ width: '25%', alignItems: 'center', gap: 4, paddingVertical: 8 }}
            >
              <IconTile emoji={c.emoji} color={categoryColor(c.color, t)} size={44} />
              <AppText variant="axis" numberOfLines={1}>
                {c.name}
              </AppText>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={{ width: '25%', alignItems: 'center', gap: 4, paddingVertical: 8 }}
          >
            <IconTile emoji="+" color={t.line} size={44} />
            <AppText variant="axis" numberOfLines={1}>
              + New category
            </AppText>
          </Pressable>
        </View>
        {adding ? (
          <View style={{ gap: 8, paddingTop: 8 }}>
            <TextInput
              accessibilityLabel="Category name"
              placeholder="Name"
              placeholderTextColor={t.inkFaded}
              value={name}
              onChangeText={v => {
                setName(v);
                setError(null);
              }}
              maxLength={40}
              style={input}
            />
            <TextInput
              accessibilityLabel="Category emoji"
              placeholder="Emoji"
              placeholderTextColor={t.inkFaded}
              value={emoji}
              onChangeText={setEmoji}
              maxLength={8}
              style={input}
            />
            {error ? <AppText tone="muted">{error}</AppText> : null}
            <Button label="Add category" onPress={add} disabled={!canAdd || create.isPending} />
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
