import { ImageBackground, ScrollView, type ScrollViewProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

const grain = {
  dark: require('../../assets/grain-dark.png'),
  light: require('../../assets/grain-light.png'),
};

/** App background: bg colour with a tiled paper-grain texture. No fade-in, so tab switches don't flash on Android. */
export function Screen({ children, style, refreshControl, testID, ...rest }: ViewProps & Pick<ScrollViewProps, 'refreshControl'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground source={grain[t.mode]} resizeMode="repeat" fadeDuration={0} style={{ flex: 1, backgroundColor: t.bg }} {...rest}>
      {/* The status-bar inset is a margin outside the ScrollView, so content scrolls up to it, not under it. */}
      <ScrollView
        testID={testID}
        refreshControl={refreshControl}
        style={{ marginTop: insets.top }}
        contentContainerStyle={[{ padding: 16, paddingTop: 12, gap: 10 }, style]}
      >
        {children}
      </ScrollView>
    </ImageBackground>
  );
}
