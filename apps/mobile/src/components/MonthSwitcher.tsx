import { addMonths } from '@curly/core';
import { Pressable, View } from 'react-native';
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

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const t = useTheme();
  return (
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
      <AppText variant="bodyStrong">{monthLabel(value)}</AppText>
      <Pressable accessibilityLabel="Next month" hitSlop={8} onPress={() => onChange(addMonths(value, 1))} style={{ padding: 8 }}>
        <AppText variant="bodyStrong">›</AppText>
      </Pressable>
    </View>
  );
}
