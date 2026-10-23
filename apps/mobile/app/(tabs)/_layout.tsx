import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { tabBarColors } from '../../src/theme/chrome';
import { useTheme } from '../../src/theme/useTheme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(testName: string, name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons testID={`tab-icon-${testName}`} name={name} size={size} color={color as string} />
  );
}

export default function TabLayout() {
  const t = useTheme();
  const tint = tabBarColors(t);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Mount every tab up front and paint the scene in the app colour, so switching tabs never flashes.
        lazy: false,
        sceneStyle: { backgroundColor: t.bg },
        tabBarActiveTintColor: tint.active,
        tabBarInactiveTintColor: tint.inactive,
        tabBarStyle: {
          backgroundColor: t.mode === 'dark' ? t.bg : t.surface,
          borderTopColor: t.line,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accounts', tabBarIcon: tabIcon('accounts', 'wallet-outline') }} />
      <Tabs.Screen name="spending" options={{ title: 'Spending', tabBarIcon: tabIcon('spending', 'pie-chart-outline') }} />
      <Tabs.Screen
        name="projections"
        options={{ title: 'Projections', tabBarIcon: tabIcon('projections', 'trending-up-outline') }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: tabIcon('more', 'ellipsis-horizontal-circle-outline') }} />
    </Tabs>
  );
}
