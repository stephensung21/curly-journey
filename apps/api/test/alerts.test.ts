import { describe, expect, it } from 'vitest';
import type { TransactionRow } from '@curly/core';
import { runAlerts } from '../src/alerts/runAlerts';
import type { Db } from '../src/db/db';
import { makeEventsRepo } from '../src/db/events';
import { makeNotifyRepo } from '../src/db/notify';
import { makeRepo } from '../src/db/repo';
import type { PushClient, PushMessage } from '../src/push/types';
import { fakePocketSmith, pgliteDb } from './helpers';

// 09:30 on Sunday 25 Oct in Sydney (AEDT).
const NOW = new Date('2026-10-24T22:30:00Z');
const DEVICE = 'ExponentPushToken[fake-device-1]';

type FakePush = PushClient & { sent: { tokens: string[]; messages: PushMessage[] }[]; fail: boolean; invalid: string[] };

function fakePush(): FakePush {
  const p: FakePush = {
    sent: [],
    fail: false,
    invalid: [],
    async send(tokens, messages) {
      if (p.fail) throw new Error('push down');
      p.sent.push({ tokens, messages });
      return { invalidTokens: p.invalid };
    },
  };
  return p;
}

async function setup() {
  const raw = await pgliteDb();
  let calls = 0;
  const db: Db = {
    query(text, params) {
      calls++;
      return raw.query(text, params);
    },
  };
  const repo = makeRepo(raw);
  const events = makeEventsRepo(raw);
  // Drop the migration's seeded reminders so each test controls what is due.
  await raw.query('delete from calendar_event');
  const bank = await repo.upsertAccount({
    source: 'pocketsmith', externalId: '1', institution: 'CommBank', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-24',
  });
  await raw.query(
    "insert into sync_log (started_at, finished_at, status) values ($1, $2, 'ok')",
    [new Date(NOW.getTime() - 65 * 60_000).toISOString(), new Date(NOW.getTime() - 60 * 60_000).toISOString()],
  );
  await makeNotifyRepo(raw).addDevice(DEVICE);
  const cats = await repo.listCategories();
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  let n = 0;
  const txn = async (date: string, amountCents: number, merchant: string, categoryName?: string): Promise<number> => {
    const row: TransactionRow = {
      source: 'pocketsmith', externalId: `t${++n}`, accountExternalId: '1', date, amountCents,
      descriptionRaw: merchant.toUpperCase(), payee: merchant, status: 'posted', merchant, psCategory: null, memo: null,
      feedCreatedAt: '2026-10-20T00:00:00Z',
    };
    await repo.upsertFeedTransactions([{ accountId: bank, row }]);
    const [r] = await raw.query<{ id: string }>('select id::text as id from transaction where external_id = $1', [row.externalId]);
    if (categoryName) {
      await raw.query("update transaction set category_id = $2, category_source = 'rule', categorised = true where id = $1", [
        r!.id, cat(categoryName),
      ]);
    }
    return Number(r!.id);
  };
  const internet = () =>
    events.create({
      name: 'Internet', emoji: '🌐', amountCents: 8900, accountId: null, startDate: '2026-10-20', repeat: 'monthly', leadDays: 2, onDayAlert: false,
    });
  const logKeys = async () => (await raw.query<{ key: string }>('select key from notification_log order by key')).map((r) => r.key);
  const push = fakePush();
  const run = (p: PushClient | undefined = push) => runAlerts({ db, pocketsmith: fakePocketSmith(), now: () => NOW, push: p });
  return { raw, events, cat, txn, internet, logKeys, push, run, calls: () => calls };
}

const titles = (p: FakePush) => p.sent.flatMap((s) => s.messages.map((m) => m.title));

describe('runAlerts', () => {
  it('auto-ticks a matched bill and does not ask whether it got paid', async () => {
    const s = await setup();
    const e = await s.internet();
    const t = await s.txn('2026-10-21', -8900, 'Aussie Broadband');
    const res = await s.run();
    expect(res.matched).toBe(1);
    expect(await s.events.statuses('2026-10-20', '2026-10-20')).toEqual([
      { eventId: e.id, date: '2026-10-20', status: 'paid', source: 'auto', transactionId: t },
    ]);
    expect(titles(s.push)).not.toContain('Did this get paid?');
    expect(res.sent).toBe(0);
  });

  it('asks once whether an unmatched bill got paid', async () => {
    const s = await setup();
    const e = await s.internet();
    const res = await s.run();
    expect(res).toEqual({ matched: 0, sent: 1 });
    expect(s.push.sent).toHaveLength(1);
    expect(s.push.sent[0]!.tokens).toEqual([DEVICE]);
    expect(s.push.sent[0]!.messages).toEqual([
      { title: 'Did this get paid?', body: 'Internet was due Tue 20 Oct', url: `/calendar?ask=${e.id}:2026-10-20` },
    ]);
    expect(await s.logKeys()).toEqual([`paid:${e.id}:2026-10-20`]);
    expect((await s.run()).sent).toBe(0);
    expect(s.push.sent).toHaveLength(1);
  });

  it('warns once a category limit passes its warn level', async () => {
    const s = await setup();
    await s.raw.query('insert into spending_limit (category_id, amount_cents) values ($1, 50000)', [s.cat('Groceries')]);
    await s.txn('2026-10-05', -46000, 'Woolworths', 'Groceries');
    expect((await s.run()).sent).toBe(1);
    expect(s.push.sent[0]!.messages).toEqual([{ title: 'Spending limit', body: 'Groceries is at 92% of your limit', url: '/limits' }]);
  });

  it('releases the claimed keys when the send fails, so the next run sends', async () => {
    const s = await setup();
    await s.internet();
    s.push.fail = true;
    await expect(s.run()).rejects.toThrow('push down');
    expect(await s.logKeys()).toEqual([]);
    s.push.fail = false;
    expect((await s.run()).sent).toBe(1);
    expect(titles(s.push)).toEqual(['Did this get paid?']);
  });

  it('sends nothing and claims nothing without devices, but still auto-ticks', async () => {
    const s = await setup();
    await s.raw.query('delete from push_device');
    await s.internet();
    expect(await s.run()).toEqual({ matched: 0, sent: 0 });
    expect(await s.logKeys()).toEqual([]);
    expect(s.push.sent).toEqual([]);

    const e = await s.events.create({
      name: 'Water', emoji: '💧', amountCents: 12000, accountId: null, startDate: '2026-10-22', repeat: 'none', leadDays: 0, onDayAlert: false,
    });
    const t = await s.txn('2026-10-22', -12000, 'Sydney Water');
    expect(await s.run(undefined)).toEqual({ matched: 1, sent: 0 });
    expect((await s.events.statuses('2026-10-22', '2026-10-22'))[0]).toMatchObject({ eventId: e.id, transactionId: t });
    expect(await s.logKeys()).toEqual([]);
  });

  it('removes a device Expo reports as not registered', async () => {
    const s = await setup();
    await s.internet();
    s.push.invalid = [DEVICE];
    expect((await s.run()).sent).toBe(1);
    expect(await makeNotifyRepo(s.raw).devices()).toEqual([]);
  });

  it('stays within a small call budget', async () => {
    const s = await setup();
    await s.internet();
    await s.txn('2026-10-21', -8900, 'Aussie Broadband');
    await s.raw.query('insert into spending_limit (category_id, amount_cents) values ($1, 50000)', [s.cat('Groceries')]);
    await s.txn('2026-10-05', -46000, 'Woolworths', 'Groceries');
    s.push.invalid = [DEVICE];
    const before = s.calls();
    await s.run();
    // Database queries plus the one push request.
    expect(s.calls() - before + s.push.sent.length).toBeLessThanOrEqual(20);
  });
});
