import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { IconTile } from './IconTile';

/** Emoji tile, name, a 10px bar in the category colour on a surface track, and the amount. */
export function CategoryBar({
  emoji,
  color,
  name,
  cents,
  fraction,
  onPress,
}: {
  emoji: string;
  color: string;
  name: string;
  cents: number;
  /** 0 to 1: this category's share of the largest one. */
  fraction: number;
  onPress?: () => void;
}) {
  const t = useTheme();
  const pct = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <IconTile emoji={emoji} color={color} />
      <View style={{ flex: 1, gap: 4 }}>
        <AppText>{name}</AppText>
        <View style={{ height: 10, borderRadius: 5, backgroundColor: t.surface, overflow: 'hidden' }}>
          <View style={{ width: pct, height: 10, borderRadius: 5, backgroundColor: color }} />
        </View>
      </View>
      <Amount cents={cents} decimals="never" />
    </Pressable>
  );
}
