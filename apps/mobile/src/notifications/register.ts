import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { apiFetch } from '../api/client';
import { loadConnection } from '../api/connection';
import type { Connection } from '../api/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function postToken(conn: Connection): Promise<void> {
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await apiFetch<void>(conn, '/push/devices', { method: 'POST', body: JSON.stringify({ token }) });
}

/** Ask for permission (if needed), then register this device's Expo push token with the API. */
export async function registerForPush(conn: Connection): Promise<'registered' | 'denied'> {
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return 'denied';
  await postToken(conn);
  return 'registered';
}

/** On app start: refresh the token (it can rotate) only when already allowed. Never prompts; never throws. */
export async function reregisterQuietly(conn?: Connection | null): Promise<void> {
  try {
    const c = conn ?? (await loadConnection());
    if (!c) return;
    const perm = await Notifications.getPermissionsAsync();
    if (perm.granted) await postToken(c);
  } catch {
    // Best effort; the Notifications screen shows real status.
  }
}
