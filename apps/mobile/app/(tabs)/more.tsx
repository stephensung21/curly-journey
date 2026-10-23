import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';

export default function MoreScreen() {
  return (
    <Screen>
      <AppText variant="title">More</AppText>
      <AppText variant="label" tone="muted">
        App
      </AppText>
      <Link href="/settings" asChild>
        <Pressable accessibilityRole="link">
          <Card>
            <AppText>Settings</AppText>
          </Card>
        </Pressable>
      </Link>
      <Link href="/import" asChild>
        <Pressable accessibilityRole="link">
          <Card>
            <AppText>Import</AppText>
          </Card>
        </Pressable>
      </Link>
      <Link href="/design-system" asChild>
        <Pressable accessibilityRole="link">
          <Card>
            <AppText>Design system</AppText>
          </Card>
        </Pressable>
      </Link>
    </Screen>
  );
}
