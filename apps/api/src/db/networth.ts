import type { AccountKind, NwAccount } from '@curly/core';
import type { Db } from './db';

export type NetWorthRepo = {
  /** One query: accounts that count toward net worth. */
  accounts(): Promise<NwAccount[]>;
  upsertSnapshot(date: string, ownCents: number, oweCents: number): Promise<void>;
  /** One query: transaction totals per account per day, after `after`. */
  flows(after: string): Promise<{ accountId: number; date: string; amountCents: number }[]>;
  /** One query: the earliest transaction or trade date, or null with neither. */
  earliestDate(): Promise<string | null>;
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

    async flows(after) {
      const rows = await db.query<{ account_id: number; date: string; total: string | number }>(
        `select account_id, to_char(date, 'YYYY-MM-DD') as date, sum(amount_cents)::text as total
         from transaction where date > $1::date group by account_id, date`,
        [after],
      );
      return rows.map((r) => ({ accountId: Number(r.account_id), date: r.date, amountCents: Number(r.total) }));
    },

    async earliestDate() {
      const rows = await db.query<{ d: string | null }>(
        `select to_char(least((select min(date) from transaction), (select min(date) from trade)), 'YYYY-MM-DD') as d`,
      );
      return rows[0]?.d ?? null;
    },
  };
}
