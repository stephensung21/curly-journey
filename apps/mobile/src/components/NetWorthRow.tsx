import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useNetWorth } from '../api/hooks';
import type { NetWorthResponse } from '../api/types';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { HandNote } from './doodles/HandNote';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "up $6,200 since Sep"; nothing when there is no earlier point or no change. */
export function SinceNote({ since, onAccent = false }: { since: NetWorthResponse['since']; onAccent?: boolean }) {
  const t = useTheme();
  if (!since || since.deltaCents === 0) return null;
  const up = since.deltaCents > 0;
  return (
    <HandNote tone={up ? 'lime' : 'pink'} style={onAccent ? { color: t.inkOnAccent } : undefined}>
      {up ? 'up' : 'down'} <Amount cents={Math.abs(since.deltaCents)} decimals="never" inline /> since {MONTHS[Number(since.fromDate.slice(5, 7)) - 1]}
    </HandNote>
  );
}

/** Home row under the hero card. Renders nothing while loading or if the request fails. */
export function NetWorthRow() {
  const router = useRouter();
  const { data } = useNetWorth('1M');
  if (!data) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Net worth"
      onPress={() => router.push('/networth')}
      style={{ backgroundColor: accents.lime, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, gap: 2 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText variant="label" tone="onAccent">
          Net worth
        </AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Amount cents={data.totalCents} decimals="never" tone="onAccent" />
          <AppText tone="onAccent">›</AppText>
        </View>
      </View>
      <SinceNote since={data.since} onAccent />
    </Pressable>
  );
}
