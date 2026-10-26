import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { tabBarColors } from '../theme/chrome';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

/** Bottom tab bar for the swipeable tabs: icon over label, in the app's colours. */
export function TabBar({ state, descriptors, emitter, jumpTo, insets }: MaterialTopTabBarProps) {
  const t = useTheme();
  const tint = tabBarColors(t);
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: t.mode === 'dark' ? t.bg : t.surface,
        borderTopColor: t.line,
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingBottom: insets.bottom,
      }}
    >
      {state.routes.map((route, i) => {
        const { options } = descriptors[route.key]!;
        const focused = state.index === i;
        const color = focused ? tint.active : tint.inactive;
        const title = options.title ?? route.name;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${title}, tab, ${i + 1} of ${state.routes.length}`}
            onPress={() => {
              const e = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !e.defaultPrevented) jumpTo(route.key);
            }}
            style={{ flex: 1, alignItems: 'center', paddingTop: 7, paddingBottom: 6, gap: 2 }}
          >
            {options.tabBarIcon?.({ focused, color })}
            <AppText variant="axis" style={{ color }}>
              {title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
