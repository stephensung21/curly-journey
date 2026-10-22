import { Tabs } from 'expo-router';
import { tabBarColors } from '../../src/theme/chrome';
import { useTheme } from '../../src/theme/useTheme';

export default function TabLayout() {
  const t = useTheme();
  const tint = tabBarColors(t);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: tint.active,
        tabBarInactiveTintColor: tint.inactive,
        tabBarStyle: {
          backgroundColor: t.mode === 'dark' ? t.bg : t.surface,
          borderTopColor: t.line,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Accounts' }} />
      <Tabs.Screen name="spending" options={{ title: 'Spending' }} />
      <Tabs.Screen name="projections" options={{ title: 'Projections' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
