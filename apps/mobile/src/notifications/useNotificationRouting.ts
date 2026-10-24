import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

type Response = Notifications.NotificationResponse | null;

/** Follow a tapped notification's in-app path. Anything not starting with a single '/' is ignored. */
function pathFrom(response: Response): string | null {
  const url = (response?.notification.request.content.data as { url?: unknown } | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

/** `ready` = navigator mounted and a connection exists; nothing routes before then. */
export function useNotificationRouting(ready: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const go = (r: Response) => {
      const path = pathFrom(r);
      if (path) router.push(path as never);
    };
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    Notifications.getLastNotificationResponseAsync()
      .then(r => live && go(r))
      .catch(() => {});
    return () => {
      live = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
