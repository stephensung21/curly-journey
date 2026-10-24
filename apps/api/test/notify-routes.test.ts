import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeNotifyRepo } from '../src/db/notify';
import type { PushMessage } from '../src/push/types';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const TOKEN = 'ExponentPushToken[fake-token_1]';

async function setup(withPush = true) {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const sent: { tokens: string[]; messages: PushMessage[] }[] = [];
  const push = withPush
    ? { async send(tokens: string[], messages: PushMessage[]) { sent.push({ tokens, messages }); return { invalidTokens: [] }; } }
    : undefined;
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z'), push });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: auth, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, call, sent };
}

describe('notify routes', () => {
  it('rejects a bad token', async () => {
    const { call } = await setup();
    const res = await call('POST', '/push/devices', { token: 'nope' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad_token' });
  });

  it('keeps one row when the same token is added twice', async () => {
    const { call, db } = await setup();
    expect((await call('POST', '/push/devices', { token: TOKEN })).status).toBe(204);
    expect((await call('POST', '/push/devices', { token: TOKEN })).status).toBe(204);
    expect(await makeNotifyRepo(db).devices()).toEqual([TOKEN]);
  });

  it('sets and reads prefs; unknown keys are 400', async () => {
    const { call } = await setup();
    const before = (await (await call('GET', '/notifications/prefs')).json()) as Record<string, boolean>;
    expect(before).toEqual({ limit: true, bill: true, paid_check: true, sync: true, stale: true, trade_hint: true });
    expect((await call('PUT', '/notifications/prefs', { bill: false })).status).toBe(200);
    const after = (await (await call('GET', '/notifications/prefs')).json()) as Record<string, boolean>;
    expect(after.bill).toBe(false);
    expect(after.limit).toBe(true);
    const bad = await call('PUT', '/notifications/prefs', { foo: true });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'bad_prefs' });
    expect((await call('PUT', '/notifications/prefs', { bill: 'yes' })).status).toBe(400);
  });

  it('test route: 409 with no devices, sends with a device', async () => {
    const { call, sent } = await setup();
    const none = await call('POST', '/notifications/test');
    expect(none.status).toBe(409);
    expect(await none.json()).toEqual({ error: 'no_devices' });
    await call('POST', '/push/devices', { token: TOKEN });
    const ok = await call('POST', '/notifications/test');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ sent: 1 });
    expect(sent).toEqual([{ tokens: [TOKEN], messages: [{ title: 'Test notification', body: 'Notifications are working', url: '/notifications' }] }]);
  });

  it('test route: 503 when devices exist but push is unset', async () => {
    const { call } = await setup(false);
    expect((await call('POST', '/notifications/test')).status).toBe(409);
    await call('POST', '/push/devices', { token: TOKEN });
    const res = await call('POST', '/notifications/test');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'push_unavailable' });
  });
});

describe('notify repo keys', () => {
  it('claimKeys returns only new keys; releaseKeys frees them', async () => {
    const { db } = await setup();
    const repo = makeNotifyRepo(db);
    expect([...(await repo.claimKeys(['a', 'b']))].sort()).toEqual(['a', 'b']);
    expect([...(await repo.claimKeys(['b', 'c']))]).toEqual(['c']);
    expect([...(await repo.claimKeys([]))]).toEqual([]);
    await repo.releaseKeys(['b']);
    expect([...(await repo.claimKeys(['b']))]).toEqual(['b']);
  });
});
