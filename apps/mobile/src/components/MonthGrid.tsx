import { dayLabel } from '@curly/core';
import { Pressable, View } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

const HEADERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const DOT_COLORS = [accents.orange, accents.lime, accents.blue, accents.yellow, accents.pink, accents.purple];
/** An event's colour: accents cycled by event id. */
export const eventColor = (id: number): string => DOT_COLORS[id % DOT_COLORS.length];

type Props = {
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  /** ISO date -> dot colours (first 3 shown). */
  dots: Record<string, string[]>;
  selected?: string;
  onSelect?: (iso: string) => void;
};

/** Monday-first month grid. With onSelect it doubles as a date picker. */
export function MonthGrid({ month, today, dots, selected, onSelect }: Props) {
  const t = useTheme();
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const blanks = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...new Array<null>(blanks).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const cellStyle = { flex: 1, height: 44, alignItems: 'center', gap: 2 } as const;

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row' }}>
        {HEADERS.map((h, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <AppText variant="label" tone="muted">
              {h}
            </AppText>
          </View>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {week.map((day, i) => {
            if (day === null) return <View key={i} testID="grid-blank" style={cellStyle} />;
            const iso = `${month}-${String(day).padStart(2, '0')}`;
            const isToday = iso === today;
            const cell = (
              <>
                <View
                  testID={isToday ? 'grid-today' : undefined}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isToday ? accents.orange : 'transparent',
                    borderWidth: iso === selected ? 2 : 0,
                    borderColor: t.ink,
                  }}
                >
                  <AppText variant="bodyStrong" tone={isToday ? 'onAccent' : iso < today ? 'faded' : 'ink'}>
                    {String(day)}
                  </AppText>
                </View>
                <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                  {(dots[iso] ?? []).slice(0, 3).map((c, k) => (
                    <View key={k} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c }} />
                  ))}
                </View>
              </>
            );
            return onSelect ? (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={dayLabel(iso)} onPress={() => onSelect(iso)} style={cellStyle}>
                {cell}
              </Pressable>
            ) : (
              <View key={i} style={cellStyle}>
                {cell}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
