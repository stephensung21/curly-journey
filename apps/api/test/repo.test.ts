import { beforeEach, describe, expect, it } from 'vitest';
import type { AccountRow, TransactionRow } from '@curly/core';
import { makeRepo, type Repo } from '../src/db/repo';
import { pgliteDb } from './helpers';

const acct = (over: Partial<AccountRow> = {}): AccountRow => ({
  source: 'pocketsmith',
  externalId: '1',
  institution: 'CommBank',
  name: 'Everyday',
  kind: 'transaction',
  balanceCents: 1000,
  balanceDate: '2026-10-01',
  ...over,
});

const tx = (over: Partial<TransactionRow> = {}): TransactionRow => ({
  source: 'pocketsmith',
  externalId: 't1',
  accountExternalId: '1',
  date: '2026-10-05',
  amountCents: -500,
  descriptionRaw: 'COFFEE',
  payee: 'Cafe',
  status: 'posted',
  ...over,
});

let repo: Repo;
beforeEach(async () => {
  repo = makeRepo(await pgliteDb());
});

describe('accounts', () => {
  it('upsert twice updates balance in one row', async () => {
    const a = await repo.upsertAccount(acct());
    const b = await repo.upsertAccount(acct({ balanceCents: 2500 }));
    expect(b).toBe(a);
    const list = await repo.listAccounts();
    expect(list).toHaveLength(1);
    expect(list[0]!.balanceCents).toBe(2500);
    expect(list[0]!.balanceDate).toBe('2026-10-01');
  });

  it('keeps user settings on re-upsert', async () => {
    const id = await repo.upsertAccount(acct());
    await repo.updateAccountSettings(id, { countsSpending: false, isOffset: true, displayName: 'Mine' });
    await repo.upsertAccount(acct({ balanceCents: 7, name: 'Renamed' }));
    const [a] = await repo.listAccounts();
    expect(a).toMatchObject({ countsSpending: false, isOffset: true, displayName: 'Mine', balanceCents: 7, name: 'Renamed' });
  });

  it('mortgage gets default counts', async () => {
    await repo.upsertAccount(acct({ kind: 'mortgage' }));
    const [a] = await repo.listAccounts();
    expect(a).toMatchObject({ countsSpending: false, countsNetWorth: true, projections: 'mortgage' });
  });

  it('updateAccountSettings returns null for unknown id', async () => {
    expect(await repo.updateAccountSettings(999, { isOffset: true })).toBeNull();
  });
});

describe('transactions', () => {
  it('upsert same externalId twice keeps latest', async () => {
    const id = await repo.upsertAccount(acct());
    await repo.upsertTransactions(id, [tx()]);
    expect(await repo.upsertTransactions(id, [tx({ amountCents: -900 })])).toBe(1);
    const rows = await repo.listTransactions(id, '2026-10');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountCents).toBe(-900);
    expect(rows[0]!.date).toBe('2026-10-05');
    expect(typeof rows[0]!.amountCents).toBe('number');
  });

  it('listTransactions month edges, newest first', async () => {
    const id = await repo.upsertAccount(acct());
    await repo.upsertTransactions(id, [
      tx({ externalId: 'a', date: '2026-09-30' }),
      tx({ externalId: 'b', date: '2026-10-01' }),
      tx({ externalId: 'c', date: '2026-10-31' }),
      tx({ externalId: 'd', date: '2026-11-01' }),
    ]);
    const rows = await repo.listTransactions(id, '2026-10');
    expect(rows.map((r) => r.date)).toEqual(['2026-10-31', '2026-10-01']);
  });

  it('insertCsvRows is idempotent', async () => {
    const id = await repo.upsertAccount(acct());
    const rows = [
      { row: { date: '2026-10-02', amountCents: -100, description: 'X' }, fingerprint: 'f1' },
      { row: { date: '2026-10-03', amountCents: -200, description: 'Y' }, fingerprint: 'f2' },
    ];
    expect(await repo.insertCsvRows(id, rows)).toBe(2);
    expect(await repo.insertCsvRows(id, rows)).toBe(0);
    const near = await repo.transactionsNear(id, '2026-10-01', '2026-10-02');
    expect(near).toEqual([{ date: '2026-10-02', amountCents: -100, description: 'X' }]);
  });
});

describe('sync log', () => {
  const t0 = new Date('2026-10-23T00:00:00Z');
  it('blocks concurrent syncs, allows after finish', async () => {
    const id = await repo.startSync(t0);
    expect(id).not.toBeNull();
    expect(await repo.startSync(new Date(t0.getTime() + 60_000))).toBeNull();
    await repo.finishSync(id!, { status: 'ok', accounts: 1, transactions: 2 }, new Date(t0.getTime() + 120_000));
    expect(await repo.startSync(new Date(t0.getTime() + 180_000))).not.toBeNull();
  });

  it('allows a new sync once the running one is over 10 minutes old', async () => {
    await repo.startSync(t0);
    expect(await repo.startSync(new Date(t0.getTime() + 11 * 60_000))).not.toBeNull();
  });

  it('lastSuccessfulSync ignores failed', async () => {
    expect(await repo.lastSuccessfulSync()).toBeNull();
    const a = (await repo.startSync(t0))!;
    await repo.finishSync(a, { status: 'ok' }, new Date(t0.getTime() + 1000));
    const b = (await repo.startSync(new Date(t0.getTime() + 3_600_000)))!;
    await repo.finishSync(b, { status: 'failed', error: 'boom' }, new Date(t0.getTime() + 3_601_000));
    const last = await repo.lastSuccessfulSync();
    expect(last!.startedAt.getTime()).toBe(t0.getTime());
    expect(last!.finishedAt.getTime()).toBe(t0.getTime() + 1000);
  });

  it('lastSyncStatus returns latest row status', async () => {
    expect(await repo.lastSyncStatus()).toBeNull();
    const a = (await repo.startSync(t0))!;
    expect(await repo.lastSyncStatus()).toBe('running');
    await repo.finishSync(a, { status: 'ok' }, new Date(t0.getTime() + 1000));
    expect(await repo.lastSyncStatus()).toBe('ok');
    const b = (await repo.startSync(new Date(t0.getTime() + 3_600_000)))!;
    await repo.finishSync(b, { status: 'failed', error: 'x' }, new Date(t0.getTime() + 3_601_000));
    expect(await repo.lastSyncStatus()).toBe('failed');
  });
});
