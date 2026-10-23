import { beforeEach, describe, expect, it } from 'vitest';
import { SEED_CATEGORIES, type AccountRow, type TransactionRow } from '@curly/core';
import { makeRepo, type Repo } from '../src/db/repo';
import type { Db } from '../src/db/db';
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
  merchant: 'Cafe',
  psCategory: null,
  memo: null,
  feedCreatedAt: '2026-10-05T01:00:00Z',
  ...over,
});

let db: Db;
let repo: Repo;
beforeEach(async () => {
  db = await pgliteDb();
  repo = makeRepo(db);
});

describe('categories', () => {
  it('migration seeds exactly SEED_CATEGORIES, in order', async () => {
    const rows = await db.query<{ name: string; emoji: string; color: string; kind: string }>(
      'select name, emoji, color, kind from category order by sort',
    );
    expect(rows).toEqual(SEED_CATEGORIES.map(({ name, emoji, color, kind }) => ({ name, emoji, color, kind })));
  });
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

  it('getAccount returns dto with source, null if unknown', async () => {
    const id = await repo.upsertAccount(acct());
    expect(await repo.getAccount(id)).toMatchObject({ id, source: 'pocketsmith', name: 'Everyday' });
    expect(await repo.getAccount(999)).toBeNull();
  });

  it('existingCsvKeys finds only csv keys for that account', async () => {
    const a = await repo.upsertAccount(acct());
    const b = await repo.upsertAccount(acct({ externalId: '2' }));
    await repo.insertCsvRows(a, [{ row: { date: '2026-10-01', amountCents: -1, description: 'X' }, fingerprint: 'k1' }]);
    expect([...(await repo.existingCsvKeys(a, ['k1', 'k2']))]).toEqual(['k1']);
    expect((await repo.existingCsvKeys(b, ['k1'])).size).toBe(0);
    expect((await repo.existingCsvKeys(a, [])).size).toBe(0);
  });

  it('upsertAccountStates upserts many accounts in one query, in input order', async () => {
    const first = await repo.upsertAccountState(acct({ externalId: '2' }));
    await repo.setHistory(first.id, '2026-07-26', false);
    let queries = 0;
    const counted = makeRepo({ query: (t, p) => (queries++, db.query(t, p)) } as Db);
    const states = await counted.upsertAccountStates([acct({ externalId: '1' }), acct({ externalId: '2', balanceCents: 5 })]);
    expect(queries).toBe(1);
    expect(states[1]).toEqual({ id: first.id, historyFrom: '2026-07-26', historyDone: false, historyCursor: null });
    expect(states[0]).toMatchObject({ historyFrom: null, historyDone: false });
    expect(states[0]!.id).not.toBe(first.id);
    expect((await repo.getAccount(first.id))!.balanceCents).toBe(5);
    expect(await counted.upsertAccountStates([])).toEqual([]);
    expect(queries).toBe(1);
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
    // transactionsNear returns feed rows only, so CSV rows never appear.
    expect(await repo.transactionsNear(id, '2026-10-01', '2026-10-02')).toEqual([]);
    expect(await repo.listTransactions(id, '2026-10')).toHaveLength(2);
  });

  it('insertCsvRows stores the cleaned merchant', async () => {
    const id = await repo.upsertAccount(acct());
    await repo.insertCsvRows(id, [{ row: { date: '2026-10-02', amountCents: -100, description: 'WOOLWORTHS 1234 SYDNEY' }, fingerprint: 'f1' }]);
    const rows = await db.query<{ merchant: string }>('select merchant from transaction');
    expect(rows).toEqual([{ merchant: 'Woolworths' }]);
  });
});

describe('deleteMissingFeedRows', () => {
  it('deletes only feed rows of the given accounts in the date range that were not kept', async () => {
    const a = await repo.upsertAccount(acct());
    const b = await repo.upsertAccount(acct({ externalId: '2' }));
    const c = await repo.upsertAccount(acct({ externalId: '3' }));
    await repo.upsertTransactions(a, [
      tx({ externalId: 'old', date: '2026-10-08' }),
      tx({ externalId: 'keep', date: '2026-10-09' }),
      tx({ externalId: 'gone', date: '2026-10-20' }),
      tx({ externalId: 'future', date: '2026-10-24' }),
    ]);
    await repo.upsertTransactions(b, [tx({ externalId: 'goneB', date: '2026-10-20' })]);
    await repo.upsertTransactions(c, [tx({ externalId: 'other', date: '2026-10-20' })]);
    await repo.insertCsvRows(a, [{ row: { date: '2026-10-20', amountCents: -1, description: 'X' }, fingerprint: 'csv1' }]);
    expect(await repo.deleteMissingFeedRows([a, b], '2026-10-09', '2026-10-23', ['keep'])).toEqual({ deleted: 2, edits: [] });
    const left = await db.query<{ external_id: string }>('select external_id from transaction order by external_id');
    expect(left.map((r) => r.external_id)).toEqual(['csv1', 'future', 'keep', 'old', 'other']);
    expect((await repo.deleteMissingFeedRows([a], '2026-10-09', '2026-10-23', [])).deleted).toBe(1);
    expect(await repo.deleteMissingFeedRows([], '2026-10-01', '2026-10-31', [])).toEqual({ deleted: 0, edits: [] });
  });
});

describe('upsertFeedTransactions', () => {
  it('upserts rows for several accounts in one query', async () => {
    const a = await repo.upsertAccount(acct());
    const b = await repo.upsertAccount(acct({ externalId: '2' }));
    let queries = 0;
    const counted = makeRepo({ query: (t, p) => (queries++, db.query(t, p)) } as Db);
    expect(await counted.upsertFeedTransactions([
      { accountId: a, row: tx({ externalId: 'x' }) },
      { accountId: b, row: tx({ externalId: 'y' }) },
    ])).toBe(2);
    expect(queries).toBe(1);
    const rows = await db.query<{ external_id: string; account_id: number }>('select external_id, account_id from transaction order by external_id');
    expect(rows).toEqual([{ external_id: 'x', account_id: a }, { external_id: 'y', account_id: b }]);
  });
});

describe('history cursor', () => {
  it('is saved, returned by the account upsert, and cleared when a window completes', async () => {
    const id = await repo.upsertAccount(acct());
    const url = 'https://api.pocketsmith.com/v2/transaction_accounts/1/transactions?page=3';
    await repo.setHistoryCursor(id, url);
    expect((await repo.upsertAccountState(acct())).historyCursor).toBe(url);
    await repo.setHistory(id, '2026-07-26', false);
    expect((await repo.upsertAccountState(acct())).historyCursor).toBeNull();
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
