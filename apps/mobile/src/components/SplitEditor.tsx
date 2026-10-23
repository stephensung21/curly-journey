import { parseDecimalToCents } from '@curly/core';
import { useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import type { Category, Transaction } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { Amount } from './Amount';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { CategoryPicker } from './CategoryPicker';
import { Sheet } from './Sheet';

type Part = { categoryId: number | null; text: string };
type Splits = Transaction['splits'];

/** Parts are typed as magnitudes in dollars ("12", "12.5", "12.50", optional leading "-"). Null when invalid or zero. */
function magnitudeCents(text: string): number | null {
  const s = text.trim().replace(/^-/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = parseDecimalToCents(s);
  return cents > 0 ? cents : null;
}

/** Divide a transaction across categories. Each part takes the transaction's sign. */
export function SplitEditor({
  visible,
  onClose,
  txn,
  categories,
  onSave,
  failed,
}: {
  visible: boolean;
  onClose: () => void;
  txn: Transaction;
  categories: Category[];
  onSave: (splits: Splits) => void;
  failed: boolean;
}) {
  const t = useTheme();
  const sign = txn.amountCents < 0 ? -1 : 1;
  const total = Math.abs(txn.amountCents);
  const [parts, setParts] = useState<Part[]>(() =>
    txn.splits.length >= 2
      ? txn.splits.map(s => ({ categoryId: s.categoryId, text: (Math.abs(s.amountCents) / 100).toFixed(2) }))
      : [{ categoryId: null, text: '' }, { categoryId: null, text: '' }],
  );
  const [pickingFor, setPickingFor] = useState<number | null>(null);

  const cents = parts.map(p => magnitudeCents(p.text));
  const assigned = cents.reduce<number>((sum, c) => sum + (c ?? 0), 0);
  const remaining = total - assigned;
  const valid = parts.length >= 2 && parts.every((p, i) => p.categoryId !== null && cents[i] !== null) && remaining === 0;

  const set = (i: number, patch: Partial<Part>) => setParts(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="title">Split</AppText>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
        {parts.map((p, i) => {
          const cat = categories.find(c => c.id === p.categoryId);
          return (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                accessibilityLabel={`Part ${i + 1} category`}
                accessibilityRole="button"
                onPress={() => setPickingFor(i)}
                style={{ flex: 1, backgroundColor: t.surfaceSunken, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}
              >
                <AppText numberOfLines={1}>{cat ? `${cat.emoji} ${cat.name}` : 'Choose category'}</AppText>
              </Pressable>
              <TextInput
                accessibilityLabel={`Part ${i + 1} amount`}
                placeholder="0.00"
                placeholderTextColor={t.inkFaded}
                keyboardType="decimal-pad"
                value={p.text}
                onChangeText={text => set(i, { text })}
                style={{
                  width: 96,
                  backgroundColor: t.surfaceSunken,
                  color: t.ink,
                  fontFamily: fonts.medium,
                  fontSize: 14,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  textAlign: 'right',
                }}
              />
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => setParts(ps => [...ps, { categoryId: null, text: '' }])}>
          <AppText tone="muted">+ Add part</AppText>
        </Pressable>
        <AppText tone="muted">
          <Amount cents={Math.abs(remaining)} inline />
          {remaining < 0 ? ' too much' : ' left to assign'}
        </AppText>
      </ScrollView>
      {failed ? <AppText tone="muted">Couldn't save. Try again.</AppText> : null}
      <Button
        label="Save"
        disabled={!valid}
        onPress={() => valid && onSave(parts.map((p, i) => ({ categoryId: p.categoryId!, amountCents: sign * cents[i]! })))}
      />
      {txn.splits.length > 0 ? <Button kind="secondary" label="Remove split" onPress={() => onSave([])} /> : null}
      <CategoryPicker
        visible={pickingFor !== null}
        onClose={() => setPickingFor(null)}
        categories={categories}
        onPick={id => {
          if (pickingFor !== null) set(pickingFor, { categoryId: id });
          setPickingFor(null);
        }}
      />
    </Sheet>
  );
}
