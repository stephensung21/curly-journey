import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { makeRepo } from '../src/db/repo';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

const csv = readFileSync(join(__dirname, '..', '..', '..', 'packages', 'core', 'test', 'fixtures', 'commbank.csv'), 'utf8');

type Preview = { new: { description: string }[]; duplicates: { description: string }[]; skipped: { line: number; reason: string }[] };

async function setup() {
  const db = await pgliteDb();
  const token = await seedToken(db);
  const repo = makeRepo(db);
  const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const accountId = await repo.upsertAccount({ source: 'pocketsmith', externalId: '1', institution: 'CBA', name: 'Everyday', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
  await repo.upsertTransactions(accountId, [{
    source: 'pocketsmith', externalId: 'f1', accountExternalId: '1', date: '2026-10-21', amountCents: -8420,
    descriptionRaw: 'WOOLWORTHS 1234 SYDNEY', payee: 'Woolies', status: 'posted',
    merchant: 'Woolworths', psCategory: null, memo: null, feedCreatedAt: '2026-10-21T01:00:00Z',
  }]);
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    app.request(path, { method: 'POST', headers: { ...auth, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { app, auth, accountId, repo, post };
}

describe('imports', () => {
  it('preview splits duplicates and new', async () => {
    const { post, accountId } = await setup();
    const res = await post('/imports/preview', { accountId, format: 'commbank', csv });
    expect(res.status).toBe(200);
    const b = (await res.json()) as Preview;
    expect(b.duplicates).toHaveLength(1);
    expect(b.duplicates[0]!.description).toContain('WOOLWORTHS');
    expect(b.new).toHaveLength(3);
    expect(b.skipped).toEqual([]);
  });

  it('commit inserts 3, again inserts 0', async () => {
    const { post, accountId, app, auth } = await setup();
    expect(await (await post('/imports/commit', { accountId, format: 'commbank', csv })).json()).toEqual({ inserted: 3 });
    expect(await (await post('/imports/commit', { accountId, format: 'commbank', csv })).json()).toEqual({ inserted: 0 });
    const t = (await (await app.request(`/accounts/${accountId}/transactions?month=2026-10`, { headers: auth })).json()) as { transactions: unknown[] };
    expect(t.transactions).toHaveLength(4);
    const pv = (await (await post('/imports/preview', { accountId, format: 'commbank', csv })).json()) as Preview;
    expect(pv.new).toHaveLength(0);
    expect(pv.duplicates).toHaveLength(4);
  });

  it('malformed line goes to skipped with line number', async () => {
    const { post, accountId } = await setup();
    const bad = csv.trimEnd() + '\nnot,a,valid\n';
    const b = (await (await post('/imports/preview', { accountId, format: 'commbank', csv: bad })).json()) as Preview;
    expect(b.skipped).toHaveLength(1);
    expect(typeof b.skipped[0]!.line).toBe('number');
    expect(b.new).toHaveLength(3);
  });

  it('same file into two accounts does not collide', async () => {
    const { post, accountId, repo } = await setup();
    const other = await repo.upsertAccount({ source: 'pocketsmith', externalId: 'x', institution: 'B', name: 'B', kind: 'transaction', balanceCents: 0, balanceDate: '2026-10-22' });
    await post('/imports/commit', { accountId, format: 'commbank', csv });
    expect(await (await post('/imports/commit', { accountId: other, format: 'commbank', csv })).json()).toEqual({ inserted: 4 });
  });

  it('validation errors', async () => {
    const { post, accountId } = await setup();
    const cases: [unknown, number, string][] = [
      [{ accountId: 999, format: 'commbank', csv }, 404, 'account_not_found'],
      [{ accountId, format: 'westpac', csv }, 400, 'bad_format'],
      [{ accountId, format: 'commbank' }, 400, 'bad_csv'],
      [{ accountId: 'x', format: 'commbank', csv }, 400, 'bad_account'],
      ['{nope', 400, 'bad_json'],
    ];
    for (const [body, status, error] of cases) {
      const res = await post('/imports/preview', body);
      expect(res.status).toBe(status);
      expect(await res.json()).toEqual({ error });
    }
  });

  it('413 when csv or content-length over 2MB', async () => {
    const { post, accountId } = await setup();
    const big = 'a'.repeat(2 * 1024 * 1024 + 1);
    expect((await post('/imports/commit', { accountId, format: 'commbank', csv: big })).status).toBe(413);
    expect((await post('/imports/preview', { accountId, format: 'commbank', csv }, { 'Content-Length': String(3 * 1024 * 1024) })).status).toBe(413);
  });
});

describe('fuzzy duplicate matching', () => {
  const commbank = (rows: [string, string, string][]) => rows.map(([d, a, desc]) => `${d},"${a}","${desc}","+1.00"`).join('\n') + '\n';

  it('one feed row swallows only one of two identical CSV rows', async () => {
    const { post, accountId, repo } = await setup();
    await repo.upsertTransactions(accountId, [{
      source: 'pocketsmith', externalId: 'f2', accountExternalId: '1', date: '2026-10-20', amountCents: -450,
      descriptionRaw: 'CAFE ABC', payee: 'Cafe', status: 'posted',
      merchant: 'Cafe Abc', psCategory: null, memo: null, feedCreatedAt: '2026-10-20T01:00:00Z',
    }]);
    const text = commbank([['20/10/2026', '-4.50', 'CAFE ABC'], ['20/10/2026', '-4.50', 'CAFE ABC']]);
    const b = (await (await post('/imports/preview', { accountId, format: 'commbank', csv: text })).json()) as Preview;
    expect(b.duplicates).toHaveLength(1);
    expect(b.new).toHaveLength(1);
  });

  it('earlier CSV import does not swallow a new CSV row a day later', async () => {
    const { post, accountId } = await setup();
    await post('/imports/commit', { accountId, format: 'commbank', csv: commbank([['20/10/2026', '-4.50', 'CAFE ABC']]) });
    const b = (await (await post('/imports/preview', { accountId, format: 'commbank', csv: commbank([['21/10/2026', '-4.50', 'CAFE ABC']]) })).json()) as Preview;
    expect(b.duplicates).toHaveLength(0);
    expect(b.new).toHaveLength(1);
  });
});
