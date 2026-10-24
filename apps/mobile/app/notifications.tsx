import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ApiError } from '../src/api/client';
import { useNotificationPrefs, useRegisterDevice, useSetNotificationPrefs, useTestNotification } from '../src/api/hooks';
import type { NotificationPrefs } from '../src/api/types';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { Screen } from '../src/components/Screen';
import { Toggle } from '../src/components/Toggle';

type Permission = 'granted' | 'denied' | 'undetermined' | null;

const ROWS: { key: keyof NotificationPrefs; title: string; sub: string }[] = [
  { key: 'limit', title: 'Spending limits', sub: 'At your warning level and at 100%' },
  { key: 'bill', title: 'Bills & dates', sub: 'Before each event, and on the day if you ask' },
  { key: 'paid_check', title: 'Did this get paid?', sub: "When a bill's payment doesn't show up" },
  { key: 'sync', title: 'Bank sync problems', sub: "When accounts haven't updated for 36 hours" },
  { key: 'stale', title: 'Manual values', sub: 'When super or home value is 3 months old' },
];

function testError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) return 'Turn on notifications first';
  if (e instanceof ApiError && e.status === 503) return "Push isn't set up on the server yet";
  return "Couldn't send the test";
}

export default function NotificationsScreen() {
  const router = useRouter();
  const prefs = useNotificationPrefs().data;
  const setPrefs = useSetNotificationPrefs();
  const register = useRegisterDevice();
  const sendTest = useTestNotification();
  const [permission, setPermission] = useState<Permission>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Notifications.getPermissionsAsync()
      .then(p => live && setPermission(p.granted ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined'))
      .catch(() => live && setPermission('undetermined'));
    return () => {
      live = false;
    };
  }, []);

  const turnOn = async () => {
    setError(null);
    try {
      setPermission((await register.mutateAsync()) === 'registered' ? 'granted' : 'denied');
    } catch {
      setError("Couldn't turn on notifications");
    }
  };

  const test = async () => {
    setError(null);
    try {
      await sendTest.mutateAsync();
    } catch (e) {
      setError(testError(e));
    }
  };

  const on = permission === 'granted';

  return (
    <Screen>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.back()}>
        <AppText tone="muted">‹ More</AppText>
      </Pressable>
      <AppText variant="title">Notifications</AppText>

      <Card style={{ gap: 8 }}>
        <AppText variant="bodyStrong">{on ? 'Notifications are on' : 'Notifications are off'}</AppText>
        {permission === 'denied' ? <AppText tone="muted">Allow notifications in Android settings</AppText> : null}
        {!on ? <Button label="Turn on notifications" disabled={register.isPending} onPress={() => void turnOn()} /> : null}
      </Card>

      {ROWS.map(r => (
        <Card key={r.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <AppText>{r.title}</AppText>
            <AppText variant="label" tone="muted">
              {r.sub}
            </AppText>
          </View>
          <Toggle accessibilityLabel={r.title} value={prefs?.[r.key] ?? true} onChange={v => setPrefs.mutate({ [r.key]: v })} />
        </Card>
      ))}

      <Button kind="secondary" label="Send a test notification" disabled={sendTest.isPending} onPress={() => void test()} />
      {error ? <AppText tone="muted">{error}</AppText> : null}
    </Screen>
  );
}
