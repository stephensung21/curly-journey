import { monthKey, parseDecimalToCents } from '@curly/core';
import { useEffect, useState } from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { useCreateGoal, useDeleteGoal, useUpdateGoal } from '../api/hooks';
import type { Account, Goal, GoalBody } from '../api/types';
import { now } from '../lib/now';
import { useSettings } from '../settings/store';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText, fonts } from './AppText';
import { Button } from './Button';
import { EmojiPicker } from './EmojiPicker';
import { MonthSwitcher } from './MonthSwitcher';
import { Sheet } from './Sheet';
import { Toggle } from './Toggle';

/** The last day of a YYYY-MM month: a goal "by March" means by the end of March. */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ backgroundColor: selected ? accents.lime : t.surfaceSunken, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 }}
    >
      <AppText variant="bodyStrong" tone={selected ? 'onAccent' : 'ink'} style={{ fontSize: 13 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** New goal, or edit one. Tracks net worth unless accounts are chosen. */
export function GoalSheet({
  visible,
  editing,
  accounts,
  onClose,
}: {
  visible: boolean;
  editing: Goal | null;
  /** Accounts a goal can track. */
  accounts: Account[];
  onClose: () => void;
}) {
  const t = useTheme();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const del = useDeleteGoal();
  const hidden = useSettings(s => s.hideBalances);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🎯');
  const [amount, setAmount] = useState('');
  const [byDate, setByDate] = useState(false);
  const [month, setMonth] = useState(monthKey(now()));
  const [accountIds, setAccountIds] = useState<number[]>([]);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // With hide balances on, an existing target isn't shown; an empty field keeps it.
  const keepHidden = !!editing && hidden;

  useEffect(() => {
    if (!visible) return;
    setName(editing?.name ?? '');
    setEmoji(editing?.emoji ?? '🎯');
    setAmount(editing && !hidden ? String(editing.targetCents / 100) : '');
    setByDate(!!editing?.targetDate);
    setMonth(editing?.targetDate?.slice(0, 7) ?? monthKey(now()));
    setAccountIds(editing?.accountIds ?? []);
    setError(null);
    // Keyed on the id so a background refetch does not wipe what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editing?.id, hidden]);

  const input = {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;
  const toggleAccount = (id: number) => setAccountIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  async function save() {
    const trimmed = name.trim();
    let targetCents = 0;
    try {
      targetCents = keepHidden && amount.trim() === '' ? editing.targetCents : parseDecimalToCents(amount);
    } catch {
      // Falls through to the message below.
    }
    if (!trimmed) return setError('Give it a name');
    if (targetCents <= 0) return setError('Enter a target above $0');
    const body: GoalBody = { name: trimmed, emoji, targetCents, targetDate: byDate ? monthEnd(month) : null, accountIds };
    setError(null);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...body });
      else await create.mutateAsync(body);
    } catch {
      return setError("Couldn't save the goal. Try again.");
    }
    onClose();
  }

  function remove() {
    if (!editing) return;
    Alert.alert('Delete this goal?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          del.mutateAsync(editing.id).then(onClose, () => setError("Couldn't delete the goal. Try again."));
        },
      },
    ]);
  }

  return (
    <>
      <Sheet visible={visible && !pickingIcon} onClose={onClose}>
        <AppText variant="title">{editing ? 'Edit goal' : 'New goal'}</AppText>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Goal icon" onPress={() => setPickingIcon(true)} style={input}>
            <AppText style={{ fontSize: 20 }}>{emoji}</AppText>
          </Pressable>
          <TextInput
            accessibilityLabel="Goal name"
            placeholder="e.g. House deposit"
            placeholderTextColor={t.inkFaded}
            value={name}
            onChangeText={v => {
              setName(v);
              setError(null);
            }}
            maxLength={60}
            style={[input, { flex: 1 }]}
          />
        </View>
        <TextInput
          accessibilityLabel="Goal target"
          placeholder={keepHidden ? 'Hidden. Type to change' : 'Target, e.g. 50000'}
          placeholderTextColor={t.inkFaded}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={v => {
            setAmount(v);
            setError(null);
          }}
          style={input}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AppText style={{ flex: 1 }}>By a date</AppText>
          <Toggle accessibilityLabel="By a date" value={byDate} onChange={setByDate} />
        </View>
        {byDate ? <MonthSwitcher value={month} onChange={setMonth} /> : null}
        <AppText variant="label" tone="muted">
          Counts
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Option label="Net worth" selected={accountIds.length === 0} onPress={() => setAccountIds([])} />
          {accounts.map(a => (
            <Option key={a.id} label={a.displayName ?? a.name} selected={accountIds.includes(a.id)} onPress={() => toggleAccount(a.id)} />
          ))}
        </View>
        {error ? <AppText>{error}</AppText> : null}
        <Button label="Save" onPress={() => void save()} disabled={create.isPending || update.isPending} />
        {editing ? <Button kind="secondary" label="Delete goal" onPress={remove} disabled={del.isPending} /> : null}
      </Sheet>
      <EmojiPicker
        visible={visible && pickingIcon}
        onClose={() => setPickingIcon(false)}
        onPick={icon => {
          setEmoji(icon ?? '🎯');
          setPickingIcon(false);
        }}
      />
    </>
  );
}
