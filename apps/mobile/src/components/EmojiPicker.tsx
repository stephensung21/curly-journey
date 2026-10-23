import { Pressable, ScrollView } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';
import { Sheet } from './Sheet';

export const PICKER_EMOJI = [
  '💳', '🏦', '💰', '💵', '🐷', '🏠', '🚗', '✈️', '🎓', '🛒',
  '🍔', '☕', '🎁', '💼', '🧾', '📈', '📉', '🏖️', '👶', '🐶',
  '❤️', '⭐', '🔒', '🧰', '🛠️', '🎯', '🌱', '🍀', '🔥', '💎',
  '🪙', '🏧', '📦', '🧳', '🎮', '🎵', '📚', '🏥', '⚡', '🌊',
];

/** Sheet with an emoji grid and a Default tile (null). Picking closes the sheet. */
export function EmojiPicker({ visible, onClose, onPick }: { visible: boolean; onClose: () => void; onPick: (icon: string | null) => void }) {
  const t = useTheme();
  const pick = (icon: string | null) => {
    onPick(icon);
    onClose();
  };
  const tile = { width: 52, height: 52, borderRadius: 14, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Sheet visible={visible} onClose={onClose}>
      <AppText variant="bodyStrong">Choose an icon</AppText>
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Default icon" onPress={() => pick(null)} style={[tile, { width: 'auto', paddingHorizontal: 14 }]}>
          <AppText>Default</AppText>
        </Pressable>
        {PICKER_EMOJI.map(e => (
          <Pressable key={e} accessibilityRole="button" accessibilityLabel={e} onPress={() => pick(e)} style={tile}>
            <AppText style={{ fontSize: 26 }}>{e}</AppText>
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}
