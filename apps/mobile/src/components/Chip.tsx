import { Pressable } from 'react-native';
import { accents } from '../theme/tokens';
import { AppText } from './AppText';

/** Dark pill with lime text, for a tappable heads-up sitting on the orange hero card. */
export function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ backgroundColor: '#16131f', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}
    >
      <AppText variant="bodyStrong" style={{ color: accents.lime, fontSize: 12 }}>
        {label}
      </AppText>
    </Pressable>
  );
}
