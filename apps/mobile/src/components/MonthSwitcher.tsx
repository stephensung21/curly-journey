import { addMonths, monthKey } from '@curly/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { now } from '../lib/now';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/** ‹ Month Year ›. Tapping the label opens a year-by-year grid of months to jump straight to one; the current month is ringed. */
export function MonthSwitcher({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const current = monthKey(now());
  return (
    <View style={{ gap: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: t.surface,
          borderRadius: 999,
          paddingHorizontal: 6,
        }}
      >
        <Pressable accessibilityLabel="Previous month" hitSlop={8} onPress={() => onChange(addMonths(value, -1))} style={{ padding: 8 }}>
          <AppText variant="bodyStrong">‹</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose month, ${monthLabel(value)}`}
          onPress={() => {
            setYear(Number(value.slice(0, 4)));
            setOpen(o => !o);
          }}
          style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
        >
          <AppText variant="bodyStrong">{monthLabel(value)}</AppText>
        </Pressable>
        <Pressable accessibilityLabel="Next month" hitSlop={8} onPress={() => onChange(addMonths(value, 1))} style={{ padding: 8 }}>
          <AppText variant="bodyStrong">›</AppText>
        </Pressable>
      </View>
      {value !== current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to this month"
          hitSlop={6}
          onPress={() => {
            setOpen(false);
            onChange(current);
          }}
          style={{ alignSelf: 'center', backgroundColor: t.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}
        >
          <AppText variant="label">↩ This month</AppText>
        </Pressable>
      ) : null}
      {open && (
        <View style={{ backgroundColor: t.surface, borderRadius: 20, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable accessibilityLabel="Previous year" hitSlop={8} onPress={() => setYear(y => y - 1)} style={{ padding: 6 }}>
              <AppText variant="bodyStrong">‹</AppText>
            </Pressable>
            <AppText variant="bodyStrong">{String(year)}</AppText>
            <Pressable accessibilityLabel="Next year" hitSlop={8} onPress={() => setYear(y => y + 1)} style={{ padding: 6 }}>
              <AppText variant="bodyStrong">›</AppText>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
            {MONTHS.map((name, i) => {
              const key = `${year}-${String(i + 1).padStart(2, '0')}`;
              const short = name.slice(0, 3);
              const selected = key === value;
              const isCurrent = key === current;
              return (
                <View key={key} style={{ width: '25%', paddingHorizontal: 4 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Pick ${short} ${year}${isCurrent ? ', this month' : ''}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setOpen(false);
                      onChange(key);
                    }}
                    style={{
                      alignItems: 'center',
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: selected ? accents.orange : t.surfaceSunken,
                      borderWidth: isCurrent ? 2 : 0,
                      borderColor: t.ink,
                    }}
                  >
                    <AppText variant="bodyStrong" style={selected ? { color: t.inkOnAccent } : undefined}>
                      {short}
                    </AppText>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
