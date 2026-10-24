import { describe, expect, it } from 'vitest';
import { pgliteDb } from './helpers';

const account = (source: string) =>
  `insert into account (source, external_id, institution, name, kind, counts_spending, counts_net_worth) values ('${source}', 'x', 'I', 'N', 'transaction', false, true)`;

describe('migration 0005', () => {
  it('seeds two events and five enabled notification prefs', async () => {
    const db = await pgliteDb();
    const events = await db.query<{ name: string }>('select name from calendar_event order by name');
    expect(events.map((e) => e.name)).toEqual(['Amex statement closes', 'Mortgage repayment']);
    const prefs = await db.query<{ type: string; enabled: boolean }>('select type, enabled from notification_pref order by type');
    expect(prefs.map((p) => p.type)).toEqual(['bill', 'limit', 'paid_check', 'stale', 'sync']);
    expect(prefs.every((p) => p.enabled)).toBe(true);
  });

  it('accepts coinspot accounts and rejects unknown sources', async () => {
    const db = await pgliteDb();
    await db.query(account('coinspot'));
    await expect(db.query(account('other'))).rejects.toThrow();
  });
});
