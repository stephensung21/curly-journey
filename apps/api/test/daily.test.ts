import { describe, expect, it, vi } from 'vitest';
import { MAX_DAILY_CALLS, runDaily } from '../src/daily/runDaily';
import type { Db } from '../src/db/db';
import { makeHoldingsRepo } from '../src/db/holdings';
import type { PriceClient } from '../src/prices/yahoo';
import { fakePocketSmith, pgliteDb } from './helpers';

const NOW = new Date('2026-10-24T02:00:00Z'); // 2026-10-24 Sydney

async function setup(symbols: string[] = ['VAS']) {
  const db = await pgliteDb();
  const holdings = makeHoldingsRepo(db);
  const accountId = await holdings.ensureCommsecAccount(NOW);
  await holdings.insertTrades(
    accountId,
    symbols.map((symbol, i) => ({
      date: '2026-10-01', reference: null, side: 'buy' as const, symbol, units: 10, priceMicros: 100_000_000,
      brokerageCents: 0, totalCents: 100_000, source: 'csv' as const, fingerprint: `fp${i}`,
    })),
  );
  return { db, holdings, accountId };
}
const balance = async (db: Db, id: number) =>
  Number((await db.query<{ b: string }>('select balance_cents::text as b from account where id = $1', [id]))[0]!.b);
const deps = (db: Db, prices?: PriceClient) => ({ db, pocketsmith: fakePocketSmith(), now: () => NOW, prices });

describe('runDaily', () => {
  it('stores prices, updates the CommSec balance and writes the snapshot', async () => {
    const { db, accountId } = await setup();
    const closes = vi.fn(async () => [{ date: '2026-10-23', closeMicros: 110_000_000 }]);
    const r = await runDaily(deps(db, { closes }));
    expect(r).toEqual({ prices: 1, snapshot: true });
    expect(await db.query("select close_micros::text c from price where symbol = 'VAS'")).toEqual([{ c: '110000000' }]);
    expect(await balance(db, accountId)).toBe(110_000); // 10 units x $110
    const snap = await db.query<{ date: string; own: string; owe: string }>(
      "select to_char(date,'YYYY-MM-DD') date, own_cents::text own, owe_cents::text owe from net_worth_snapshot",
    );
    expect(snap).toEqual([{ date: '2026-10-24', own: '110000', owe: '0' }]);
  });

  it('a failing price client still writes the snapshot and keeps the old close', async () => {
    const { db, holdings, accountId } = await setup();
    await holdings.upsertPrices([{ symbol: 'VAS', date: '2026-10-20', closeMicros: 105_000_000 }]);
    await holdings.setCommsecBalance(accountId, 105_000, '2026-10-20');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const closes = vi.fn(async () => {
      throw new Error('boom secret-conn');
    });
    const r = await runDaily(deps(db, { closes }));
    expect(r.snapshot).toBe(true);
    expect(r.prices).toBe(0);
    expect(await db.query('select 1 from price')).toHaveLength(1);
    expect(await balance(db, accountId)).toBe(105_000);
    expect(await db.query('select 1 from net_worth_snapshot')).toHaveLength(1);
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
    err.mockRestore();
  });

  it('writes the snapshot with no price client or no CommSec account', async () => {
    const db = await pgliteDb();
    expect(await runDaily(deps(db))).toEqual({ prices: 0, snapshot: true });
    expect(await db.query('select 1 from net_worth_snapshot')).toHaveLength(1);
  });

  it('dates the CommSec balance by its oldest held price, not today, when prices fail', async () => {
    const { db, holdings, accountId } = await setup();
    await holdings.upsertPrices([{ symbol: 'VAS', date: '2026-10-20', closeMicros: 105_000_000 }]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await runDaily(deps(db, { closes: vi.fn(async () => { throw new Error('down'); }) }));
    const r = await db.query<{ d: string }>("select to_char(balance_date, 'YYYY-MM-DD') d from account where id = $1", [accountId]);
    expect(r[0]!.d).toBe('2026-10-20');
  });

  it('one symbol failing does not stop the others', async () => {
    const { db } = await setup(['AAA', 'BBB']);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const closes = vi.fn(async (s: string) => {
      if (s === 'AAA') throw new Error('x');
      return [{ date: '2026-10-23', closeMicros: 1_000_000 }];
    });
    const r = await runDaily(deps(db, { closes }));
    expect(r.prices).toBe(1);
    expect(await db.query('select symbol from price')).toEqual([{ symbol: 'BBB' }]);
  });

  it('caps at 10 symbols and stays inside the call budget', async () => {
    const symbols = Array.from({ length: 12 }, (_, i) => `S${String(i).padStart(2, '0')}`);
    const { db } = await setup(symbols);
    let used = 0;
    const counting: Db = {
      query(text, params) {
        used++;
        return db.query(text, params);
      },
    };
    const closes = vi.fn(async () => {
      used++;
      return [{ date: '2026-10-23', closeMicros: 1_000_000 }];
    });
    const r = await runDaily(deps(counting, { closes }));
    expect(closes).toHaveBeenCalledTimes(10);
    expect(r.snapshot).toBe(true);
    expect(used).toBeLessThanOrEqual(MAX_DAILY_CALLS);
  });

  it('fetches history back to a week before the first trade until it is stored, then only recent closes', async () => {
    const { db, holdings } = await setup();
    const closes = vi.fn(async () => [{ date: '2026-10-23', closeMicros: 1_000_000 }]);
    await runDaily(deps(db, { closes }));
    expect(closes).toHaveBeenLastCalledWith('VAS', '2026-09-24');
    await holdings.upsertPrices([{ symbol: 'VAS', date: '2026-09-25', closeMicros: 1_000_000 }]);
    await runDaily(deps(db, { closes }));
    expect(closes).toHaveBeenLastCalledWith('VAS', undefined);
  });

  it('fetches history for sold symbols once, and skips them after', async () => {
    const { db, holdings, accountId } = await setup();
    await holdings.insertTrades(accountId, [
      { date: '2026-03-01', reference: null, side: 'buy', symbol: 'OLD', units: 5, priceMicros: 1_000_000, brokerageCents: 0, totalCents: 500, source: 'csv', fingerprint: 'o1' },
      { date: '2026-04-01', reference: null, side: 'sell', symbol: 'OLD', units: 5, priceMicros: 1_000_000, brokerageCents: 0, totalCents: 500, source: 'csv', fingerprint: 'o2' },
    ]);
    const closes = vi.fn(async () => [{ date: '2026-10-23', closeMicros: 1_000_000 }]);
    await runDaily(deps(db, { closes }));
    expect(closes).toHaveBeenCalledWith('OLD', '2026-02-22');
    await holdings.upsertPrices([{ symbol: 'OLD', date: '2026-02-23', closeMicros: 1_000_000 }]);
    closes.mockClear();
    await runDaily(deps(db, { closes }));
    expect(closes.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['VAS']);
  });
});
