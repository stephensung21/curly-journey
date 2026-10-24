import { parseDecimalToCents, sydneyDate } from '@curly/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useAccounts, useCreateEvent, useDeleteEvent, useEvents, useUpdateEvent, type EventBody } from '../../src/api/hooks';
import type { EventRepeat } from '../../src/api/types';
import { AppText, fonts } from '../../src/components/AppText';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { HandNote } from '../../src/components/doodles/HandNote';
import { EmojiPicker } from '../../src/components/EmojiPicker';
import { MonthGrid } from '../../src/components/MonthGrid';
import { MonthSwitcher } from '../../src/components/MonthSwitcher';
import { Screen } from '../../src/components/Screen';
import { Sheet } from '../../src/components/Sheet';
import { Toggle } from '../../src/components/Toggle';
import { fullDay } from '../../src/lib/days';
import { now } from '../../src/lib/now';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

const REPEATS: { value: EventRepeat; label: string }[] = [
  { value: 'none', label: 'Never' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];
const LEADS = [
  { value: 0, label: 'On the day' },
  { value: 1, label: '1 day' },
  { value: 2, label: '2 days' },
  { value: 7, label: '1 week before' },
];

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function Editor({ id, initial }: { id: number | null; initial: EventBody | null }) {
  const t = useTheme();
  const router = useRouter();
  const today = sydneyDate(now());
  const accounts = (useAccounts().data?.accounts ?? []).filter(a => a.countsSpending);
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const del = useDeleteEvent();

  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amountCents != null ? String(initial.amountCents / 100) : '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '📅');
  const [startDate, setStartDate] = useState(initial?.startDate ?? today);
  const [repeat, setRepeat] = useState<EventRepeat>(initial?.repeat ?? 'monthly');
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? 2);
  const [onDayAlert, setOnDayAlert] = useState(initial?.onDayAlert ?? false);
  const [accountId, setAccountId] = useState<number | null>(initial?.accountId ?? null);
  const [pickingIcon, setPickingIcon] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [gridMonth, setGridMonth] = useState(startDate.slice(0, 7));
  const [nameError, setNameError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const input = {
    backgroundColor: t.surfaceSunken,
    color: t.ink,
    fontFamily: fonts.medium,
    fontSize: 14,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  } as const;
  const payable = amount.trim() !== '' || accountId !== null;

  async function save() {
    const trimmed = name.trim();
    let amountCents: number | null = null;
    let bad = false;
    if (amount.trim() !== '') {
      try {
        amountCents = parseDecimalToCents(amount);
      } catch {
        amountCents = 0;
      }
      if (amountCents <= 0) bad = true;
    }
    setNameError(trimmed ? null : 'Give it a name');
    setAmountError(bad ? 'Enter an amount above $0' : null);
    if (!trimmed || bad) return;
    const body: EventBody = {
      name: trimmed,
      emoji,
      amountCents,
      accountId,
      startDate,
      repeat,
      leadDays,
      onDayAlert: leadDays > 0 && onDayAlert,
    };
    try {
      if (id === null) await create.mutateAsync(body);
      else await update.mutateAsync({ id, ...body });
    } catch {
      setSaveError("Couldn't save the event. Try again.");
      return;
    }
    router.back();
  }

  async function remove() {
    if (id === null) return;
    try {
      await del.mutateAsync(id);
    } catch {
      setSaveError("Couldn't delete the event. Try again.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText tone="muted">Cancel</AppText>
        </Pressable>
        <AppText variant="title">{id === null ? 'New event' : 'Edit event'}</AppText>
        <Pressable accessibilityRole="button" hitSlop={8} disabled={create.isPending || update.isPending} onPress={() => void save()}>
          <AppText variant="bodyStrong">Save</AppText>
        </Pressable>
      </View>

      <Card>
        <Field label="Name">
          <TextInput
            accessibilityLabel="Event name"
            placeholder="e.g. Rent"
            placeholderTextColor={t.inkFaded}
            value={name}
            onChangeText={v => {
              setName(v);
              setNameError(null);
            }}
            style={input}
          />
          {nameError ? <AppText>{nameError}</AppText> : null}
        </Field>
        <Field label="Amount (optional)">
          <TextInput
            accessibilityLabel="Event amount"
            placeholder="0"
            placeholderTextColor={t.inkFaded}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={v => {
              setAmount(v);
              setAmountError(null);
            }}
            style={input}
          />
          {amountError ? <AppText>{amountError}</AppText> : null}
        </Field>
        <Field label="Icon">
          <Pressable accessibilityRole="button" accessibilityLabel="Icon" onPress={() => setPickingIcon(true)} style={[input, { alignSelf: 'flex-start' }]}>
            <AppText style={{ fontSize: 22 }}>{emoji}</AppText>
          </Pressable>
        </Field>
        <Field label="First date">
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setGridMonth(startDate.slice(0, 7));
              setPickingDate(true);
            }}
            style={input}
          >
            <AppText>{fullDay(startDate)}</AppText>
          </Pressable>
        </Field>
      </Card>

      <Card>
        <Field label="Repeats">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REPEATS.map(r => (
              <Option key={r.value} label={r.label} selected={repeat === r.value} onPress={() => setRepeat(r.value)} />
            ))}
          </View>
        </Field>
        <Field label="Remind me">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LEADS.map(l => (
              <Option key={l.value} label={l.label} selected={leadDays === l.value} onPress={() => setLeadDays(l.value)} />
            ))}
          </View>
        </Field>
        {leadDays > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText>Also remind me on the day</AppText>
            <Toggle accessibilityLabel="Also remind me on the day" value={onDayAlert} onChange={setOnDayAlert} />
          </View>
        ) : null}
        <Field label="Paid from (optional, for auto-tick)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Option label="None" selected={accountId === null} onPress={() => setAccountId(null)} />
            {accounts.map(a => (
              <Option key={a.id} label={a.displayName ?? a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
            ))}
          </View>
        </Field>
        {payable ? <HandNote>we'll tick it off when the payment shows up</HandNote> : null}
      </Card>

      {saveError ? <AppText>{saveError}</AppText> : null}
      {id !== null ? <Button kind="secondary" label="Delete event" onPress={() => void remove()} disabled={del.isPending} /> : null}

      <EmojiPicker visible={pickingIcon} onClose={() => setPickingIcon(false)} onPick={icon => setEmoji(icon ?? '📅')} />
      <Sheet visible={pickingDate} onClose={() => setPickingDate(false)}>
        <MonthSwitcher value={gridMonth} onChange={setGridMonth} />
        <MonthGrid
          month={gridMonth}
          today={today}
          dots={{}}
          selected={startDate}
          onSelect={iso => {
            setStartDate(iso);
            setPickingDate(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

export default function EventEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const events = useEvents().data?.events;
  const numeric = id === 'new' ? null : Number(id);
  const existing = numeric === null ? null : events?.find(e => e.id === numeric);
  if (numeric !== null && !existing) return null; // Still loading, or deleted.
  const initial: EventBody | null = existing
    ? {
        name: existing.name,
        emoji: existing.emoji,
        amountCents: existing.amountCents,
        accountId: existing.accountId,
        startDate: existing.startDate,
        repeat: existing.repeat,
        leadDays: existing.leadDays,
        onDayAlert: existing.onDayAlert,
      }
    : null;
  return <Editor key={numeric ?? 'new'} id={numeric} initial={initial} />;
}
