import { parseDecimalToCents } from '@curly/core';
import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { ApiError } from '../api/client';
import { useCreateLimit, useDeleteLimit, useUpdateLimit } from '../api/hooks';
import type { Category, Limit } from '../api/types';
import { useSettings } from '../settings/store';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';

const WARN_OPTIONS = [
  { value: '70', label: '70%' },
  { value: '80', label: '80%' },
  { value: '90', label: '90%' },
];

/**
 * Add or edit a limit. `editing` set = edit that limit; otherwise a new one, for the whole month
 * (`wholeMonth`) or for a category chosen from `freeCategories`.
 */
export function LimitSheet({
  visible,
  onClose,
  editing,
  wholeMonth,
  freeCategories,
}: {
  visible: boolean;
  onClose: () => void;
  editing: Limit | null;
  wholeMonth: boolean;
  /** Spending categories that don't have a limit yet. */
  freeCategories: Category[];
}) {
  const t = useTheme();
  const create = useCreateLimit();
  const update = useUpdateLimit();
  const del = useDeleteLimit();
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [amount, setAmount] = useState('');
  const [warn, setWarn] = useState('80');
  const [error, setError] = useState<string | null>(null);
  // With hide balances on, an existing limit's amount isn't shown; an empty field keeps it.
  const hidden = useSettings(st => st.hideBalances);
  const keepHidden = !!editing && hidden;

  useEffect(() => {
    if (!visible) return;
    setCategoryId(null);
    setPicking(false);
    setError(null);
    setAmount(editing && !hidden ? String(editing.amountCents / 100) : '');
    setWarn(editing ? String(editing.warnPercent) : '80');
  // Keyed on the id so a background refetch does not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing?.id, hidden]);

  const chosen = freeCategories.find(c => c.id === categoryId);
  const needsCategory = !editing && !wholeMonth;

  async function save() {
    let amountCents = 0;
    try {
      amountCents = keepHidden && amount.trim() === '' ? editing.amountCents : parseDecimalToCents(amount);
    } catch {
      // Falls through to the message below.
    }
    if (amountCents <= 0) {
      setError('Enter an amount above $0');
      return;
    }
    if (needsCategory && categoryId === null) {
      setError('Choose a category');
      return;
    }
    const warnPercent = Number(warn);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, amountCents, warnPercent });
      else await create.mutateAsync({ categoryId: wholeMonth ? null : categoryId, amountCents, warnPercent });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'That category already has a limit' : "Couldn't save the limit. Try again.");
      return;
    }
    onClose();
  }

  function remove() {
    if (!editing) return;
    Alert.alert('Delete this limit?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          del.mutateAsync(editing.id).then(onClose, () => setError("Couldn't delete the limit. Try again."));
        },
      },
    ]);
  }

  return (
    <>
      <Sheet visible={visible} onClose={onClose}>
        <AppText variant="title">{editing ? 'Edit limit' : 'New limit'}</AppText>
        {needsCategory ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => setPicking(true)}
            style={{ backgroundColor: t.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <AppText>{chosen ? `${chosen.emoji} ${chosen.name}` : 'Choose a category'}</AppText>
          </Pressable>
        ) : null}
        <View style={{ gap: 4 }}>
          <AppText variant="label" tone="muted">
            Monthly limit
          </AppText>
          <TextInput
            accessibilityLabel="Limit amount"
            placeholder={keepHidden ? 'Hidden. Type to change' : '0'}
            placeholderTextColor={t.inkFaded}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={v => {
              setAmount(v);
              setError(null);
            }}
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
        </View>
        <View style={{ gap: 4 }}>
          <AppText variant="label" tone="muted">
            Warn me at
          </AppText>
          <Segmented options={WARN_OPTIONS} value={warn} onChange={setWarn} />
        </View>
        {error ? <AppText>{error}</AppText> : null}
        <Button label="Save" onPress={() => void save()} disabled={create.isPending || update.isPending} />
        {editing ? <Button kind="secondary" label="Delete limit" onPress={remove} disabled={del.isPending} /> : null}
      </Sheet>
      {needsCategory ? (
        <CategoryPicker
          visible={visible && picking}
          onClose={() => setPicking(false)}
          onPick={id => {
            setCategoryId(id);
            setPicking(false);
            setError(null);
          }}
          categories={freeCategories}
        />
      ) : null}
    </>
  );
}
