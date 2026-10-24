import { dayMonthLabel, monthKey, sydneyDate } from '@curly/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useCategories, useLimits } from '../src/api/hooks';
import type { Limit } from '../src/api/types';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { Card } from '../src/components/Card';
import { HeroCard } from '../src/components/HeroCard';
import { IconTile } from '../src/components/IconTile';
import { LimitMarker } from '../src/components/LimitMarker';
import { LimitSheet } from '../src/components/LimitSheet';
import { Pill } from '../src/components/Pill';
import { Screen } from '../src/components/Screen';
import { now } from '../src/lib/now';
import { categoryColor } from '../src/theme/categoryColor';
import { useTheme } from '../src/theme/useTheme';

function daysLeftIn(today: string): number {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return new Date(year, month, 0).getDate() - Number(today.slice(8, 10));
}

type SheetState = { editing: Limit | null; wholeMonth: boolean } | null;

export default function LimitsScreen() {
  const t = useTheme();
  const router = useRouter();
  const current = now();
  const month = monthKey(current);
  const limits = useLimits(month).data?.limits ?? [];
  const categories = useCategories().data ?? [];
  const byId = new Map(categories.map(c => [c.id, c]));
  const [sheet, setSheet] = useState<SheetState>(null);

  const whole = limits.find(l => l.categoryId === null);
  const rows = limits.filter(l => l.categoryId !== null);
  const taken = new Set(rows.map(l => l.categoryId));
  const free = categories.filter(c => c.kind === 'spending' && !taken.has(c.id));
  const daysLeft = daysLeftIn(sydneyDate(current));
  const dashed = { borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.inkMuted, borderRadius: 14, padding: 12 } as const;

  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ More</AppText>
      </Pressable>
      <AppText variant="title">Spending limits</AppText>
      <AppText tone="muted">We'll ping you at your warning level and at 100%.</AppText>

      {whole ? (
        <Pressable accessibilityRole="button" onPress={() => setSheet({ editing: whole, wholeMonth: true })}>
          <HeroCard style={{ gap: 4 }}>
            <AppText variant="label" tone="onAccent">
              Whole month
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Amount cents={whole.spentCents} variant="hero" tone="onAccent" decimals="never" />
              <AppText variant="title" tone="onAccent">
                /
              </AppText>
              <Amount cents={whole.amountCents} variant="title" tone="onAccent" decimals="never" />
            </View>
            <AppText variant="bodyStrong" tone="onAccent">
              {`${whole.percent}% · ${daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}`}
            </AppText>
          </HeroCard>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setSheet({ editing: null, wholeMonth: true })} style={dashed}>
          <AppText variant="bodyStrong">+ Set a whole-month limit</AppText>
        </Pressable>
      )}

      {rows.length > 0 ? (
        <Card style={{ gap: 14 }}>
          {rows.map(l => {
            const cat = byId.get(l.categoryId as number);
            return (
              <Pressable
                key={l.id}
                accessibilityRole="button"
                onPress={() => setSheet({ editing: l, wholeMonth: false })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <IconTile emoji={cat?.emoji ?? '?'} color={cat ? categoryColor(cat.color, t) : t.line} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <AppText>{cat?.name ?? 'Unknown'}</AppText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Amount cents={l.spentCents} decimals="never" />
                      <AppText tone="muted">/</AppText>
                      <Amount cents={l.amountCents} decimals="never" tone="muted" />
                    </View>
                  </View>
                  <View>
                    <View style={{ height: 10, borderRadius: 5, backgroundColor: t.surfaceSunken, overflow: 'hidden' }}>
                      <View
                        style={{
                          width: `${Math.min(100, l.percent)}%`,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: cat ? categoryColor(cat.color, t) : t.line,
                        }}
                      />
                    </View>
                    <LimitMarker fraction={l.warnPercent / 100} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <AppText variant="label" tone="muted">
                      {`${l.percent}%${l.alertedAt ? ` · alerted ${dayMonthLabel(sydneyDate(new Date(l.alertedAt)))}` : ''}`}
                    </AppText>
                    {l.level === 'warn' ? <Pill tone="warn">CLOSE</Pill> : null}
                    {l.level === 'over' ? <Pill tone="chip">OVER</Pill> : null}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      <Pressable accessibilityRole="button" onPress={() => setSheet({ editing: null, wholeMonth: false })} style={dashed}>
        <AppText variant="bodyStrong">+ Add a limit</AppText>
      </Pressable>
      <AppText variant="label" tone="muted">
        dashed line = warning level
      </AppText>

      <LimitSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        editing={sheet?.editing ?? null}
        wholeMonth={sheet?.wholeMonth ?? false}
        freeCategories={free}
      />
    </Screen>
  );
}
