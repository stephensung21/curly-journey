import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pgliteDb } from './helpers';

const account = (source: string) =>
  `insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth) values ('${source}', 'x', 'I', 'N', 'transaction', false, true)`;

describe('migration 0005', () => {
  it('seeds two events and five enabled notification prefs', async () => {
    const db = await pgliteDb();
    const events = await db.query<{ name: string }>('select name from calendar_event order by name');
    expect(events.map((e) => e.name)).toEqual(['Amex statement closes', 'Mortgage repayment']);
    const prefs = await db.query<{ type: string; enabled: boolean }>('select type, enabled from notification_pref order by type');
    expect(prefs.map((p) => p.type)).toEqual(['bill', 'limit', 'paid_check', 'stale', 'sync', 'trade_hint']);
    expect(prefs.every((p) => p.enabled)).toBe(true);
  });

  it('accepts coinspot accounts and rejects unknown sources', async () => {
    const db = await pgliteDb();
    await db.query(account('coinspot'));
    await expect(db.query(account('other'))).rejects.toThrow();
  });
});

describe('migration 0006', () => {
  it('accepts commsec accounts and bounds growth_bps', async () => {
    const db = await pgliteDb();
    await db.query(account('commsec'));
    await expect(db.query('update account set growth_bps = 2001')).rejects.toThrow();
    await db.query('update account set growth_bps = 500');
  });

  it('creates trade, price, snapshot and dismissed tables', async () => {
    const db = await pgliteDb();
    for (const t of ['trade', 'price', 'net_worth_snapshot', 'trade_hint_dismissed']) await db.query(`select * from ${t}`);
  });
});

describe('migration 0007', () => {
  it('creates a default profile and is idempotent', async () => {
    const db = await pgliteDb();
    const sql = readFileSync(join(__dirname, '..', 'migrations', '0007_projections.sql'), 'utf8');
    for (const stmt of sql.split(';').filter((x) => x.trim())) await db.query(stmt);
    const rows = await db.query<{ n: string }>('select count(*)::text as n from projection_profile');
    expect(rows[0]!.n).toBe('1');
    await expect(db.query('insert into projection_profile (id) values (2)')).rejects.toThrow();
    await expect(db.query('update projection_profile set tax_rate_bps = 6001')).rejects.toThrow();
  });
});
