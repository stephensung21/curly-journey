import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useCreateRule, useRulePreview } from '../api/hooks';
import type { Category } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Sheet } from './Sheet';
import { Toggle } from './Toggle';

/** The server accepts match text of 3 to 60 characters. */
const MIN = 3;

/**
 * Categorise every transaction whose name contains some text (e.g. "beem"): makes a rule, so new ones follow,
 * and optionally applies it to earlier ones. Transactions the owner categorised by hand are left alone.
 */
export function BulkCategoriseSheet({
  visible,
  initialText = '',
  categories,
  onClose,
}: {
  visible: boolean;
  initialText?: string;
  categories: Category[];
  onClose: () => void;
}) {
  const t = useTheme();
  const create = useCreateRule();
  const [text, setText] = useState(initialText.trim());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [past, setPast] = useState(true);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setText(initialText.trim());
    setCategoryId(null);
    setPast(true);
    setResult(null);
    setError(null);
  }, [visible, initialText]);

  const matchText = text.trim();
  const valid = matchText.length >= MIN;
  const preview = useRulePreview({ matchText, ...(categoryId !== null ? { categoryId } : {}) }, valid);
  const earlier = preview.data?.matches ?? 0;
  const category = categories.find(c => c.id === categoryId);

  async function submit() {
    if (!valid || categoryId === null || !category) return;
    try {
      const res = await create.mutateAsync({ origin: 'user', matchText, categoryId, applyToPast: past && earlier > 0 });
      const n = res.updated;
      setResult(`Done: ${n} ${n === 1 ? 'transaction' : 'transactions'} moved to ${category.name}. New ones will follow.`);
    } catch {
      setError("Couldn't save. Try again.");
    }
  }

  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose}>
        <AppText variant="bodyStrong">Categorise by name</AppText>
        {result ? (
          <>
            <AppText>{result}</AppText>
            <Button label="Close" onPress={onClose} />
          </>
        ) : (
          <>
            <TextInput
              accessibilityLabel="Name contains"
              placeholder="Name contains, e.g. beem"
              placeholderTextColor={t.inkFaded}
              value={text}
              onChangeText={v => {
                setText(v);
                setError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={60}
              style={{
                backgroundColor: t.surfaceSunken,
                color: t.ink,
                fontFamily: fonts.medium,
                fontSize: 14,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            />
            {!valid ? <AppText tone="muted">Type at least 3 letters.</AppText> : null}
            <Button kind="secondary" label={category ? `${category.emoji} ${category.name}` : 'Choose a category'} onPress={() => setPicking(true)} />
            {valid && earlier > 0 ? (
              <>
                <AppText tone="muted">{`${earlier} earlier ${earlier === 1 ? 'transaction matches' : 'transactions match'}`}</AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <AppText style={{ flex: 1 }}>{`Also change the ${earlier} earlier ${earlier === 1 ? 'one' : 'ones'}`}</AppText>
                  <Toggle accessibilityLabel={`Also change the ${earlier} earlier ${earlier === 1 ? 'one' : 'ones'}`} value={past} onChange={setPast} />
                </View>
              </>
            ) : null}
            <AppText variant="label" tone="muted">
              New transactions with this in their name will go here too. Ones you sorted by hand stay as they are.
            </AppText>
            {error ? <AppText tone="muted">{error}</AppText> : null}
            <Button label="Categorise" onPress={() => void submit()} disabled={!valid || categoryId === null || create.isPending} />
          </>
        )}
      </Sheet>
      <CategoryPicker
        visible={visible && picking}
        onClose={() => setPicking(false)}
        onPick={id => {
          setCategoryId(id);
          setPicking(false);
        }}
        categories={categories}
      />
    </>
  );
}
