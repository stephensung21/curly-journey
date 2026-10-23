import { ImageBackground, ScrollView, type ScrollViewProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

const grain = {
  dark: require('../../assets/grain-dark.png'),
  light: require('../../assets/grain-light.png'),
};

/** App background: bg colour with a tiled paper-grain texture. */
export function Screen({ children, style, refreshControl, testID, ...rest }: ViewProps & Pick<ScrollViewProps, 'refreshControl'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ImageBackground source={grain[t.mode]} resizeMode="repeat" style={{ flex: 1, backgroundColor: t.bg }} {...rest}>
      <ScrollView testID={testID} refreshControl={refreshControl} contentContainerStyle={[{ padding: 16, paddingTop: insets.top + 12, gap: 10 }, style]}>
        {children}
      </ScrollView>
    </ImageBackground>
  );
}
