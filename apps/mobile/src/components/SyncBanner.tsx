import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { accents } from '../theme/tokens';
import { AppText } from './AppText';

/** Plain-text warning strip: never the hand font. */
export function SyncBanner({ text }: { text: string }) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, backgroundColor: accents.yellow, borderRadius: 14, padding: 10 }}
    >
      <AppText variant="bodyStrong" tone="onAccent">
        {text}
      </AppText>
      <Link href="/settings" asChild>
        <Pressable accessibilityRole="link">
          <AppText variant="bodyStrong" tone="onAccent" style={{ textDecorationLine: 'underline' }}>
            Check
          </AppText>
        </Pressable>
      </Link>
    </View>
  );
}
