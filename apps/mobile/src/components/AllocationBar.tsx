import { View } from 'react-native';
import type { ValuedEtfHolding } from '../api/types';
import { accents } from '../theme/tokens';
import { AppText } from './AppText';

export const allocationColors = [accents.orange, accents.lime, accents.blue, accents.yellow, accents.pink, accents.purple];

/** One segment per holding, widths by value, with a legend of whole-number shares. */
export function AllocationBar({ holdings }: { holdings: ValuedEtfHolding[] }) {
  const total = holdings.reduce((sum, h) => sum + Math.max(0, h.valueCents), 0);
  if (total <= 0) return null;
  const shown = holdings.filter(h => h.valueCents > 0);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {shown.map(h => (
          <View
            key={h.symbol}
            accessibilityLabel={`Allocation ${h.symbol}`}
            style={{ flex: h.valueCents, backgroundColor: allocationColors[holdings.indexOf(h) % allocationColors.length] }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {shown.map(h => (
          <View key={h.symbol} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: allocationColors[holdings.indexOf(h) % allocationColors.length] }} />
            <AppText variant="label" tone="muted">{`${h.symbol} ${Math.round((h.valueCents / total) * 100)}%`}</AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
