import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useAccounts, useCategories, useCategorisationStats, useInbox, useUpdateTransaction } from '../src/api/hooks';
import type { InboxItem } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { CategoryPicker } from '../src/components/CategoryPicker';
import { BirdLogo } from '../src/components/BirdLogo';
import { Screen } from '../src/components/Screen';
import { SwipeCard } from '../src/components/SwipeCard';
import { fullDay } from '../src/lib/days';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

export default function InboxScreen() {
  const t = useTheme();
  const router = useRouter();
  const inbox = useInbox();
  const categories = useCategories().data ?? [];
  const accounts = useAccounts().data?.accounts ?? [];
  const stats = useCategorisationStats().data;
  const update = useUpdateTransaction();

  const [queue, setQueue] = useState<InboxItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [sorted, setSorted] = useState(0);
  const [failed, setFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  // Cards whose update is in flight: a fast second tap or swipe on the same card is ignored until it settles.
  const pending = useRef(new Set<number>());

  // Built once from the first load; later refetches (after each save) must not reshuffle it.
  useEffect(() => {
    if (queue === null && inbox.data) {
      setQueue(inbox.data.items);
      setTotal(inbox.data.total);
    }
  }, [inbox.data, queue]);

  const top = queue?.[0];
  const byId = new Map(categories.map(c => [c.id, c]));
  const guesses = (top?.guesses ?? []).filter(id => byId.has(id));
  const account = top ? accounts.find(a => a.id === top.accountId) : undefined;

  async function accept(categoryId: number) {
    if (!top || pending.current.has(top.id)) return;
    const item = top;
    pending.current.add(item.id);
    setFailed(false);
    setPicking(false);
    setQueue(q => (q ?? []).filter(i => i.id !== item.id));
    setSorted(n => n + 1);
    try {
      await update.mutateAsync({ id: item.id, patch: { categoryId } });
    } catch {
      setQueue(q => [item, ...(q ?? [])]);
      setSorted(n => n - 1);
      setFailed(true);
    } finally {
      pending.current.delete(item.id);
    }
  }

  function skip() {
    if (top && pending.current.has(top.id)) return;
    setFailed(false);
    setQueue(q => (q && q.length > 1 ? [...q.slice(1), q[0]!] : q));
  }

  const remaining = Math.max(0, total - sorted);
  const progress = total > 0 ? Math.min(1, sorted / total) : 0;
  const first = guesses[0];
  const firstCat = first === undefined ? undefined : byId.get(first);

  return (
    <Screen>
      <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ Back</AppText>
      </Pressable>

      {inbox.isError && queue === null ? <AppText tone="muted">Couldn't load the inbox. Go back and try again.</AppText> : null}

      {queue !== null && queue.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 12, paddingTop: 48 }}>
          <BirdLogo size={110} />
          <AppText variant="title">All sorted!</AppText>
          {stats?.autoPercent != null ? <AppText tone="muted">{`${stats.autoPercent}% sorted automatically this month`}</AppText> : null}
        </View>
      ) : null}

      {top ? (
        <>
          <AppText variant="title">{`Sort ${remaining}`}</AppText>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: sorted }}
            style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}
          >
            <View style={{ width: `${progress * 100}%`, height: 8, backgroundColor: accents.lime }} />
          </View>

          <SwipeCard key={top.id} onSwipeRight={first !== undefined ? () => void accept(first) : undefined} onSwipeLeft={skip}>
            <Card style={{ gap: 8 }}>
              <AppText variant="title">{top.merchant || top.description}</AppText>
              <AppText tone="muted">{top.description}</AppText>
              <Amount cents={top.amountCents} variant="hero" />
              <AppText tone="muted">{fullDay(top.date)}</AppText>
              {account ? <AppText tone="muted">{account.displayName ?? account.name}</AppText> : null}
              {guesses.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 }}>
                  {guesses.map((id, i) => {
                    const c = byId.get(id)!;
                    return (
                      <Pressable
                        key={id}
                        accessibilityRole="button"
                        onPress={() => void accept(id)}
                        style={{ backgroundColor: i === 0 ? accents.lime : t.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
                      >
                        <AppText variant="bodyStrong" tone={i === 0 ? 'onAccent' : 'ink'} style={{ fontSize: 13 }}>
                          {`${c.emoji} ${c.name}`}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </Card>
          </SwipeCard>

          {failed ? <AppText tone="muted">Couldn't save. Try again.</AppText> : null}

          <Button kind="secondary" label="More categories" onPress={() => setPicking(true)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Skip" onPress={skip} />
            </View>
            {firstCat ? (
              <View style={{ flex: 1 }}>
                <Button label={`Use ${firstCat.name}`} onPress={() => void accept(firstCat.id)} />
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <CategoryPicker visible={picking} onClose={() => setPicking(false)} onPick={id => void accept(id)} categories={categories} />
    </Screen>
  );
}
