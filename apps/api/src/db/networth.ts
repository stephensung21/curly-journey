import type { AccountKind, NwAccount } from '@curly/core';
import type { Db } from './db';

export type NetWorthRepo = {
  /** One query: accounts that count toward net worth. */
  accounts(): Promise<NwAccount[]>;
  upsertSnapshot(date: string, ownCents: number, oweCents: number): Promise<void>;
  /** Snapshots from `from` (or all), oldest first. */
  history(from: string | null): Promise<{ date: string; totalCents: number }[]>;
};

export function makeNetWorthRepo(db: Db): NetWorthRepo {
  return {
    async accounts() {
      const rows = await db.query<{
        id: number; name: string; kind: AccountKind; balance_cents: string | number; balance_date: string | null;
        source: string; is_offset: boolean; counts_net_worth: boolean; growth_bps: number | null;
      }>(
        `select id, coalesce(display_name, name) as name, kind, balance_cents::text as balance_cents,
                to_char(balance_date, 'YYYY-MM-DD') as balance_date, source, is_offset, counts_net_worth, growth_bps
         from account where counts_net_worth order by id`,
      );
      return rows.map((r) => ({
        id: Number(r.id), name: r.name, kind: r.kind, balanceCents: Number(r.balance_cents), balanceDate: r.balance_date,
        source: r.source, isOffset: r.is_offset, countsNetWorth: r.counts_net_worth,
        growthBps: r.growth_bps === null ? null : Number(r.growth_bps),
      }));
    },

    async upsertSnapshot(date, ownCents, oweCents) {
      await db.query(
        `insert into net_worth_snapshot (date, own_cents, owe_cents) values ($1::date, $2, $3)
         on conflict (date) do update set own_cents = excluded.own_cents, owe_cents = excluded.owe_cents`,
        [date, ownCents, oweCents],
      );
    },

    async history(from) {
      const rows = await db.query<{ date: string; total: string | number }>(
        `select to_char(date, 'YYYY-MM-DD') as date, (own_cents + owe_cents)::text as total
         from net_worth_snapshot where ($1::date is null or date >= $1::date) order by date`,
        [from],
      );
      return rows.map((r) => ({ date: r.date, totalCents: Number(r.total) }));
    },
  };
}
