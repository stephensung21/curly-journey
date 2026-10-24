import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useAccounts, useNetWorth } from '../src/api/hooks';
import type { NwLine, NwRange } from '../src/api/types';
import { kindColor, kindEmoji } from '../src/components/AccountRow';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { CrayonUnderline } from '../src/components/doodles/CrayonUnderline';
import { IconTile } from '../src/components/IconTile';
import { NetWorthChart } from '../src/components/NetWorthChart';
import { SinceNote } from '../src/components/NetWorthRow';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { useSettings } from '../src/settings/store';
import { accents } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';

const RANGES: NwRange[] = ['1M', '6M', '1Y', 'All'];

function Line({ line, owe, onPress, indent }: { line: NwLine; owe: boolean; onPress?: () => void; indent?: boolean }) {
  const t = useTheme();
  const accounts = useAccounts().data?.accounts;
  const account = accounts?.find(a => a.id === line.accountIds[0]);
  const brokerage = /commsec/i.test(line.name);
  const generic = owe ? '💳' : brokerage ? '📈' : '🏡';
  const genericColor = owe ? accents.pink : accents.lime;
  const isGroup = line.key === 'offsets';
  const emoji = isGroup ? '🛟' : account ? (account.icon ?? kindEmoji[account.kind]) : generic;
  const color = isGroup ? accents.blue : account ? kindColor[account.kind] : genericColor;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line.name}
      disabled={!onPress}
      onPress={onPress}
      android_ripple={{ color: t.line, foreground: true }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8, paddingLeft: indent ? 24 : 0 }}
    >
      <IconTile emoji={emoji} color={color} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyStrong">{line.name}</AppText>
        {line.stale ? <Pill tone="warn">update?</Pill> : null}
      </View>
      <Amount cents={line.valueCents} decimals="never" />
    </Pressable>
  );
}

function Lines({ lines, owe }: { lines: NwLine[]; owe: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const openAccount = (id: number) => router.push({ pathname: '/account/[id]', params: { id: String(id) } });
  return (
    <Card>
      {lines.map(l => (
        <View key={l.key}>
          <Line
            line={l}
            owe={owe}
            onPress={
              l.members ? () => setOpen(open === l.key ? null : l.key) : l.accountIds.length === 1 ? () => openAccount(l.accountIds[0]!) : undefined
            }
          />
          {open === l.key ? l.members?.map(m => <Line key={m.key} line={m} owe={owe} indent onPress={() => openAccount(m.accountIds[0]!)} />) : null}
        </View>
      ))}
    </Card>
  );
}

export default function NetWorthScreen() {
  const t = useTheme();
  const router = useRouter();
  const hideBalances = useSettings(s => s.hideBalances);
  const [range, setRange] = useState<NwRange>('6M');
  const { data, isError, refetch } = useNetWorth(range);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityLabel="Back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
          <AppText variant="title">‹</AppText>
        </Pressable>
        <AppText variant="title">Net worth</AppText>
      </View>
      {!data && isError ? <AppText tone="muted">Couldn't load net worth. Pull to try again.</AppText> : null}
      {data ? (
        <>
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Amount cents={data.totalCents} decimals="never" variant="hero" />
            <CrayonUnderline width={170} color={accents.lime} />
          </View>
          <SinceNote since={data.since} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {RANGES.map(r => (
              <Pressable
                key={r}
                accessibilityRole="button"
                accessibilityState={{ selected: r === range }}
                onPress={() => setRange(r)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: r === range ? accents.lime : t.surface }}
              >
                <AppText variant={r === range ? 'bodyStrong' : 'body'} tone={r === range ? 'onAccent' : 'muted'} style={{ fontSize: 12 }}>
                  {r}
                </AppText>
              </Pressable>
            ))}
          </View>
          <NetWorthChart history={data.history} hideBalances={hideBalances} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Card style={{ flex: 1 }}>
              <AppText variant="label" tone="muted">
                You own
              </AppText>
              <Amount cents={data.ownCents} decimals="never" />
            </Card>
            <Card style={{ flex: 1 }}>
              <AppText variant="label" tone="muted">
                You owe
              </AppText>
              <Amount cents={Math.abs(data.oweCents)} decimals="never" />
            </Card>
          </View>
          <AppText variant="label" tone="muted">
            Own
          </AppText>
          <Lines lines={data.own} owe={false} />
          {data.owe.length > 0 ? (
            <>
              <AppText variant="label" tone="muted">
                Owe
              </AppText>
              <Lines lines={data.owe} owe />
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
