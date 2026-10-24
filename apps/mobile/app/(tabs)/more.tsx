import { addDays, monthKey, sydneyDate } from '@curly/core';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useCategorisationStats, useLimits, useOccurrences } from '../../src/api/hooks';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { IconTile } from '../../src/components/IconTile';
import { Screen } from '../../src/components/Screen';
import { now } from '../../src/lib/now';
import { accents } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/useTheme';

type Href = Parameters<ReturnType<typeof useRouter>['push']>[0];
type RowDef = { emoji: string; color: string; label: string; subline?: string; href: Href };

function MoreRow({ row }: { row: RowDef }) {
  const t = useTheme();
  const router = useRouter();
  return (
    // A plain Pressable, not <Link asChild>: Link's Slot drops style functions (see AccountRow).
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(row.href)}
      android_ripple={{ color: t.line, foreground: true }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 56,
        paddingVertical: 10,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: pressed ? t.line + '80' : 'transparent',
      })}
    >
      <IconTile emoji={row.emoji} color={row.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong">{row.label}</AppText>
        {row.subline ? (
          <AppText variant="label" tone="muted">
            {row.subline}
          </AppText>
        ) : null}
      </View>
      <AppText tone="muted">›</AppText>
    </Pressable>
  );
}

function Group({ heading, rows }: { heading?: string; rows: RowDef[] }) {
  return (
    <View style={{ gap: 6 }}>
      {heading ? (
        <AppText variant="label" tone="muted">
          {heading}
        </AppText>
      ) : null}
      <Card>
        {rows.map((row) => (
          <MoreRow key={row.label} row={row} />
        ))}
      </Card>
    </View>
  );
}

function limitsSubline(limits: { categoryId: number | null }[]): string {
  const monthly = limits.some((l) => l.categoryId === null);
  const n = limits.length - (monthly ? 1 : 0);
  const cats = `${n} ${n === 1 ? 'category' : 'categories'}`;
  if (monthly && n > 0) return `Monthly + ${cats}`;
  if (monthly) return 'Monthly';
  return n > 0 ? cats : 'None set';
}

export default function MoreScreen() {
  const current = now();
  const today = sydneyDate(current);
  const weekEnd = addDays(today, 6);
  const occurrences = useOccurrences(today, weekEnd).data?.occurrences ?? [];
  const limits = useLimits(monthKey(current)).data?.limits ?? [];
  const autoPercent = useCategorisationStats().data?.autoPercent;

  const coming = occurrences.filter((o) => o.status === null && o.date >= today && o.date <= weekEnd).length;

  return (
    <Screen>
      <AppText variant="title">More</AppText>
      <Group
        rows={[
          { emoji: '📅', color: accents.yellow, label: 'Bills & dates', subline: coming > 0 ? `${coming} coming up this week` : 'Nothing this week', href: '/calendar' },
          { emoji: '⬆', color: accents.blue, label: 'Import', subline: 'CommBank or Amex CSV', href: '/import' },
        ]}
      />
      <Group
        heading="Money settings"
        rows={[
          { emoji: '🚦', color: accents.lime, label: 'Spending limits', subline: limitsSubline(limits), href: '/limits' },
          {
            emoji: '🪄', color: accents.purple, label: 'Rules',
            subline: autoPercent === undefined ? undefined : `${autoPercent}% auto-sorted`, href: '/rules',
          },
          { emoji: '🦘', color: accents.orange, label: 'Add super or home value', href: '/account/new' },
        ]}
      />
      <Group
        heading="App"
        rows={[
          { emoji: '🔔', color: accents.pink, label: 'Notifications', href: '/notifications' },
          { emoji: '⚙️', color: accents.blue, label: 'Settings', href: '/settings' },
          { emoji: '🎨', color: accents.yellow, label: 'Design system', href: '/design-system' },
        ]}
      />
    </Screen>
  );
}
