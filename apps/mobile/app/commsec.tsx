import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, View } from 'react-native';
import { useCommsec, useDeleteTrade, useDismissHint } from '../src/api/hooks';
import type { Trade, ValuedEtfHolding } from '../src/api/types';
import { AllocationBar } from '../src/components/AllocationBar';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { CrayonUnderline } from '../src/components/doodles/CrayonUnderline';
import { HandNote } from '../src/components/doodles/HandNote';
import { Screen } from '../src/components/Screen';
import { TradeSheet } from '../src/components/TradeSheet';
import { dayBefore, sydneyDate } from '../src/lib/days';
import { now } from '../src/lib/now';
import { useSettings } from '../src/settings/store';
import { accents } from '../src/theme/tokens';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MASK = '•••';

function dayMonth(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
}

/** The most recent Mon-Fri on or before `iso`. */
function lastWeekday(iso: string): string {
  let d = iso;
  for (;;) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return d;
    d = dayBefore(d);
  }
}

function pct(bps: number): string {
  return `${(Math.abs(bps) / 100).toFixed(1)}%`;
}

/** Micro-dollars to cents, for display only. */
const microsToCents = (micros: number) => Math.round(micros / 10000);

function Units({ units, suffix = '' }: { units: number; suffix?: string }) {
  const hidden = useSettings(s => s.hideBalances);
  return (
    <AppText variant="label" tone="muted">
      {`${hidden ? MASK : units} units${suffix}`}
    </AppText>
  );
}

function HoldingCard({ h }: { h: ValuedEtfHolding }) {
  const gain = h.gainCents >= 0 ? accents.lime : accents.spendRed;
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{h.symbol}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Units units={h.units} suffix=" · avg" />
          <Amount cents={microsToCents(h.avgCostMicros)} variant="label" tone="muted" />
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Amount cents={h.valueCents} />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Amount cents={h.gainCents} signed variant="label" style={{ color: gain }} />
          <AppText variant="label" style={{ color: gain }}>{`(${pct(h.gainBps)})`}</AppText>
        </View>
      </View>
    </Card>
  );
}

function TradeRow({ trade, onDelete }: { trade: Trade; onDelete: () => void }) {
  return (
    <Pressable accessibilityRole="button" onLongPress={onDelete} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <AppText>{`${trade.side === 'buy' ? 'Buy' : 'Sell'} ${trade.symbol}`}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <AppText variant="label" tone="muted">{`${dayMonth(trade.date)} ·`}</AppText>
          <Units units={trade.units} suffix=" @" />
          <Amount cents={microsToCents(trade.priceMicros)} variant="label" tone="muted" />
        </View>
      </View>
      <Amount cents={trade.totalCents} />
    </Pressable>
  );
}

export default function CommsecScreen() {
  const router = useRouter();
  const { hint } = useLocalSearchParams<{ hint?: string }>();
  const q = useCommsec();
  const dismiss = useDismissHint();
  const del = useDeleteTrade();
  const [sheet, setSheet] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const data = q.data;
  const today = sydneyDate(now());
  const stale = !!data?.priceDate && data.priceDate < lastWeekday(today);
  const hintId = Number(hint);
  const showHint = !!hint && Number.isInteger(hintId) && hintId > 0;
  const empty = !data || data.accountId === null || (data.holdings.length === 0 && data.trades.length === 0);

  async function notATrade() {
    try {
      await dismiss.mutateAsync(hintId);
      router.setParams({ hint: undefined });
    } catch {
      // leave the banner up so it can be tried again
    }
  }

  function confirmDelete(trade: Trade) {
    setDeleteError(false);
    Alert.alert('Delete this trade?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void del.mutateAsync(trade.id).catch(() => setDeleteError(true)) },
    ]);
  }

  async function onRefresh() {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const buttons = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Button label="Import CSV" onPress={() => router.push('/commsec-import')} />
      </View>
      <View style={{ flex: 1 }}>
        <Button kind="secondary" label="Add trade" onPress={() => setSheet(true)} />
      </View>
    </View>
  );

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ Back</AppText>
      </Pressable>
      <AppText variant="title">📈 CommSec ETFs</AppText>

      {showHint ? (
        <Card style={{ gap: 8 }}>
          <AppText variant="bodyStrong">Looks like you bought something on CommSec.</AppText>
          {buttons}
          <Button label="Not a trade" kind="secondary" disabled={dismiss.isPending} onPress={() => void notATrade()} />
        </Card>
      ) : null}

      {q.isError && !data ? (
        <AppText tone="muted">Couldn't load CommSec. Pull to try again.</AppText>
      ) : q.isLoading && !data ? null : empty || !data ? (
        <>
          <Card style={{ gap: 4 }}>
            <AppText variant="bodyStrong">No trades yet</AppText>
            <AppText tone="muted">Import your CommSec CSV or add a trade by hand.</AppText>
          </Card>
          {buttons}
        </>
      ) : (
        <>
          <View>
            <Amount cents={data.valueCents} variant="hero" />
            <CrayonUnderline width={140} color={accents.orange} />
          </View>
          {data.costCents > 0 ? (
            <HandNote tone={data.gainCents >= 0 ? 'lime' : 'pink'}>
              {data.gainCents >= 0 ? 'up ' : 'down '}
              <Amount cents={Math.abs(data.gainCents)} inline />
              {` (${pct(data.gainBps)}) on what you paid`}
            </HandNote>
          ) : null}
          {stale ? <AppText variant="label" tone="muted">{`price as of ${dayMonth(data.priceDate!)}`}</AppText> : null}
          <AllocationBar holdings={data.holdings} />
          <AppText variant="label" tone="muted">
            Holdings
          </AppText>
          {data.holdings.map(h => (
            <HoldingCard key={h.symbol} h={h} />
          ))}
          {buttons}
          {data.trades.length > 0 ? (
            <>
              <AppText variant="label" tone="muted">
                Trades
              </AppText>
              <Card>
                {data.trades.map(tr => (
                  <TradeRow key={tr.id} trade={tr} onDelete={() => confirmDelete(tr)} />
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
      {deleteError ? <AppText style={{ color: accents.pink }}>Couldn't delete that trade. Try again.</AppText> : null}
      <TradeSheet visible={sheet} onClose={() => setSheet(false)} />
    </Screen>
  );
}
