import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useAccounts, useCategories, useCreateRule, useRulePreview, useSetSplits, useTransaction, useUpdateTransaction } from '../../src/api/hooks';
import type { Category, Flow, Transaction, TransactionPatch } from '../../src/api/types';
import { Amount } from '../../src/components/Amount';
import { AppText, fonts } from '../../src/components/AppText';
import { Button } from '../../src/components/Button';
import { CategoryPicker } from '../../src/components/CategoryPicker';
import { Card } from '../../src/components/Card';
import { HandNote } from '../../src/components/doodles/HandNote';
import { IconTile } from '../../src/components/IconTile';
import { Screen } from '../../src/components/Screen';
import { Segmented } from '../../src/components/Segmented';
import { Sheet } from '../../src/components/Sheet';
import { SplitEditor } from '../../src/components/SplitEditor';
import { Toggle } from '../../src/components/Toggle';
import { fullDay, receivedLabel } from '../../src/lib/days';
import { categoryColor } from '../../src/theme/categoryColor';
import { useTheme } from '../../src/theme/useTheme';

const FLOWS: { value: Flow; label: string }[] = [
  { value: 'normal', label: 'Spending' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'not_spending', label: 'Not spending' },
];
const SAVE_ERROR = "Couldn't save. Try again.";

/** What a learned rule matches on: the merchant, else the start of the raw description. The API needs 3 to 60 characters. */
function ruleText(txn: Transaction): string | null {
  if (txn.merchant.length >= 3) return txn.merchant;
  const raw = txn.description.slice(0, 60);
  return raw.length >= 3 ? raw : null;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="label" tone="muted">
        {label}
      </AppText>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Toggle accessibilityLabel={label} value={value} onChange={onChange} />
    </View>
  );
}

/** After a category pick: offer to make it a rule for this merchant. */
function RememberSheet({
  txn,
  matchText,
  category,
  onClose,
}: {
  txn: Transaction;
  matchText: string | null;
  category: Category;
  onClose: () => void;
}) {
  const createRule = useCreateRule();
  const preview = useRulePreview({ matchText: matchText ?? '', categoryId: category.id }, matchText !== null);
  const [always, setAlways] = useState(true);
  const [past, setPast] = useState(true);
  const [failed, setFailed] = useState(false);
  const name = txn.merchant || txn.description;
  const earlier = preview.data?.matches ?? 0;

  async function done() {
    if (!always || matchText === null) return onClose();
    try {
      await createRule.mutateAsync({ origin: 'learned', matchText, categoryId: category.id, applyToPast: earlier > 0 && past });
    } catch {
      setFailed(true);
      return;
    }
    onClose();
  }

  return (
    <Sheet visible onClose={onClose}>
      <HandNote>nice, one less to sort</HandNote>
      {matchText !== null ? (
        <>
          <ToggleRow label={`Always put ${name} in ${category.name}`} value={always} onChange={setAlways} />
          {earlier > 0 ? (
            <ToggleRow label={`Also update ${earlier} earlier ${name} transactions`} value={past} onChange={setPast} />
          ) : null}
        </>
      ) : null}
      {failed ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}
      <Button label="Done" onPress={done} />
    </Sheet>
  );
}

function NotSpendingSheet({ txn, matchText, onClose }: { txn: Transaction; matchText: string; onClose: () => void }) {
  const createRule = useCreateRule();
  const [always, setAlways] = useState(true);
  const [failed, setFailed] = useState(false);

  async function done() {
    if (!always) return onClose();
    try {
      await createRule.mutateAsync({ origin: 'learned', matchText, flow: 'not_spending', applyToPast: false });
    } catch {
      setFailed(true);
      return;
    }
    onClose();
  }

  return (
    <Sheet visible onClose={onClose}>
      <ToggleRow label={`Always treat ${txn.merchant || txn.description} as not spending`} value={always} onChange={setAlways} />
      {failed ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}
      <Button label="Done" onPress={done} />
    </Sheet>
  );
}

type ErrorKey = 'category' | 'flow' | 'note' | 'split';

function Detail({ txn }: { txn: Transaction }) {
  const router = useRouter();
  const t = useTheme();
  const categories = useCategories().data ?? [];
  const accounts = useAccounts().data?.accounts ?? [];
  const update = useUpdateTransaction();
  const setSplits = useSetSplits();

  const [picking, setPicking] = useState(false);
  const [remember, setRemember] = useState<Category | null>(null);
  const [notSpending, setNotSpending] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [note, setNote] = useState(txn.note ?? '');
  const [errors, setErrors] = useState<Record<ErrorKey, boolean>>({ category: false, flow: false, note: false, split: false });
  const fail = (key: ErrorKey, on: boolean) => setErrors(e => ({ ...e, [key]: on }));

  const category = categories.find(c => c.id === txn.categoryId);
  const account = accounts.find(a => a.id === txn.accountId);
  const name = txn.merchant || txn.description;
  const matchText = ruleText(txn);
  const categoryLabel = category ? `${category.emoji} ${category.name}` : 'Uncategorised';

  async function save(patch: TransactionPatch, key: ErrorKey) {
    try {
      await update.mutateAsync({ id: txn.id, patch });
      fail(key, false);
      return true;
    } catch {
      fail(key, true);
      return false;
    }
  }

  async function pickCategory(id: number) {
    setPicking(false);
    if (await save({ categoryId: id }, 'category')) setRemember(categories.find(c => c.id === id) ?? null);
  }

  async function pickFlow(flow: Flow) {
    if (flow === txn.flow) return;
    if ((await save({ flow }, 'flow')) && flow === 'not_spending' && matchText !== null) setNotSpending(true);
  }

  async function saveSplits(splits: Transaction['splits']) {
    try {
      await setSplits.mutateAsync({ id: txn.id, splits });
      fail('split', false);
      setSplitting(false);
    } catch {
      fail('split', true);
    }
  }

  const value = (text: string) => (
    <AppText selectable variant="bodyStrong">
      {text}
    </AppText>
  );

  return (
    <Screen>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText variant="title">‹</AppText>
      </Pressable>

      <View style={{ gap: 6 }}>
        <IconTile emoji={category?.emoji ?? '?'} color={category ? categoryColor(category.color, t) : t.line} size={56} />
        <AppText variant="title">{name}</AppText>
        <AppText variant="label" tone="muted">
          {txn.description}
        </AppText>
        <Amount cents={txn.amountCents} variant="hero" signed={txn.amountCents > 0} />
      </View>

      <Button label={category ? categoryLabel : 'Choose category'} onPress={() => setPicking(true)} />
      {errors.category ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}

      <Card style={{ gap: 12 }}>
        <Row label="Full name">{value(txn.description)}</Row>
        {txn.memo ? <Row label="Description">{value(txn.memo)}</Row> : null}
        <Row label="Category">{value(categoryLabel)}</Row>
        <Row label="Date">{value(fullDay(txn.date))}</Row>
        {txn.feedCreatedAt ? (
          <Row label="Received">
            {value(receivedLabel(txn.feedCreatedAt))}
            <AppText variant="label" tone="muted">
              When the bank feed delivered it. Banks don't share the exact time.
            </AppText>
          </Row>
        ) : null}
        <Row label="Account">{value(account ? (account.displayName ?? account.name) : '')}</Row>
        <Row label="Status">{value(txn.status === 'pending' ? 'Pending' : 'Posted')}</Row>
      </Card>

      <View style={{ gap: 6 }}>
        <AppText variant="label" tone="muted">
          Counts as
        </AppText>
        <Segmented options={FLOWS} value={txn.flow} onChange={pickFlow} />
        {errors.flow ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}
      </View>

      <Card>
        <Pressable accessibilityRole="button" onPress={() => setSplitting(true)} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText variant="bodyStrong">Split</AppText>
          <AppText tone="muted">{txn.splits.length > 1 ? `${txn.splits.length} parts` : 'Not split'}</AppText>
        </Pressable>
        {errors.split && !splitting ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}
      </Card>

      <View style={{ gap: 6 }}>
        <TextInput
          accessibilityLabel="Note"
          placeholder="Add a note"
          placeholderTextColor={t.inkFaded}
          value={note}
          onChangeText={setNote}
          onBlur={() => {
            const next = note.trim() || null;
            if (next !== txn.note) save({ note: next }, 'note');
          }}
          multiline
          style={{ backgroundColor: t.surface, color: t.ink, fontFamily: fonts.medium, fontSize: 14, borderRadius: 12, padding: 12 }}
        />
        {errors.note ? <AppText tone="muted">{SAVE_ERROR}</AppText> : null}
      </View>

      <CategoryPicker visible={picking} onClose={() => setPicking(false)} onPick={pickCategory} categories={categories} />
      {remember ? <RememberSheet txn={txn} matchText={matchText} category={remember} onClose={() => setRemember(null)} /> : null}
      {notSpending && matchText !== null ? (
        <NotSpendingSheet txn={txn} matchText={matchText} onClose={() => setNotSpending(false)} />
      ) : null}
      {splitting ? (
        <SplitEditor visible onClose={() => setSplitting(false)} txn={txn} categories={categories} onSave={saveSplits} failed={errors.split} />
      ) : null}
    </Screen>
  );
}

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useTransaction(Number(id));
  if (!q.data) {
    return (
      <Screen>
        <AppText tone="muted">{q.isError ? "Couldn't load this transaction." : 'Loading…'}</AppText>
      </Screen>
    );
  }
  return <Detail txn={q.data} />;
}
