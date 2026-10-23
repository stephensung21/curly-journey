import type { NotificationType } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeNotifyRepo } from '../db/notify';
import { isObject, readJson } from './http';

const TOKEN = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;
const TYPES: NotificationType[] = ['limit', 'bill', 'paid_check', 'sync', 'stale'];

export function notifyRoutes(deps: Deps) {
  const r = new Hono();
  const notify = makeNotifyRepo(deps.db);

  r.post('/push/devices', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const token = isObject(body) ? body.token : undefined;
    if (typeof token !== 'string' || !TOKEN.test(token)) return c.json({ error: 'bad_token' }, 400);
    await notify.addDevice(token);
    return c.body(null, 204);
  });

  r.get('/notifications/prefs', async (c) => c.json(await notify.prefs()));

  r.put('/notifications/prefs', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body) || !Object.entries(body).every(([k, v]) => (TYPES as string[]).includes(k) && typeof v === 'boolean')) {
      return c.json({ error: 'bad_prefs' }, 400);
    }
    await notify.setPrefs(body as Partial<Record<NotificationType, boolean>>);
    return c.json(await notify.prefs());
  });

  r.post('/notifications/test', async (c) => {
    const tokens = await notify.devices();
    if (tokens.length === 0) return c.json({ error: 'no_devices' }, 409);
    if (!deps.push) return c.json({ error: 'push_unavailable' }, 503);
    const { invalidTokens } = await deps.push.send(tokens, [
      { title: 'Test notification', body: 'Notifications are working', url: '/notifications' },
    ]);
    await notify.removeDevices(invalidTokens);
    return c.json({ sent: tokens.length - invalidTokens.length });
  });

  return r;
}
