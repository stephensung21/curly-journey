import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Accounts' }} />
      <Tabs.Screen name="spending" options={{ title: 'Spending' }} />
      <Tabs.Screen name="projections" options={{ title: 'Projections' }} />
      <Tabs.Screen name="more" options={{ title: 'More' }} />
    </Tabs>
  );
}
