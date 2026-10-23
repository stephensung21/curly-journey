import { defaultCounts } from '@curly/core';
import { ACCOUNT_COLS, toAccountDto, type AccountDto, type AccountSql } from './repo';
import type { Db } from './db';

export type ManualValue = { asOf: string; valueCents: number };
export type Holding = { symbol: string; units: string; audCents: number };

export type ManualRepo = {
  create(input: { name: string; icon: string | null; valueCents: number; asOf: string }): Promise<AccountDto>;
  setValue(accountId: number, valueCents: number, asOf: string): Promise<AccountDto | null>;
  values(accountId: number): Promise<ManualValue[]>;
  remove(accountId: number): Promise<boolean>;
  holdings(accountId: number): Promise<Holding[]>;
};

export function makeManualRepo(db: Db): ManualRepo {
  return {
    async create({ name, icon, valueCents, asOf }) {
      const c = defaultCounts('manual_asset');
      // One statement: the account and its first value land together or not at all.
      const rows = await db.query<AccountSql>(
        `with a as (
           insert into account (source, external_id, institution, name, kind, balance_cents, balance_date,
                                counts_spending, counts_net_worth, projections, icon)
           values ('manual', null, 'Manual', $1, 'manual_asset', $3, $4::date, $5, $6, $7, $2)
           returning *
         ), v as (
           insert into account_value (account_id, as_of, value_cents) select id, $4::date, $3 from a
         )
         select ${ACCOUNT_COLS} from a`,
        [name, icon, valueCents, asOf, c.countsSpending, c.countsNetWorth, c.projections],
      );
      return toAccountDto(rows[0]!);
    },

    async setValue(accountId, valueCents, asOf) {
      // Writes nothing unless the account exists and is manual.
      const written = await db.query<{ account_id: number }>(
        `insert into account_value (account_id, as_of, value_cents)
         select id, $2::date, $3 from account where id = $1 and source = 'manual'
         on conflict (account_id, as_of) do update set value_cents = excluded.value_cents
         returning account_id`,
        [accountId, asOf, valueCents],
      );
      if (!written[0]) return null;
      const done = await db.query<{ id: number }>(
        `update account a set balance_cents = v.value_cents, balance_date = v.as_of
         from (select value_cents, as_of from account_value where account_id = $1 order by as_of desc limit 1) v
         where a.id = $1 and a.source = 'manual' returning a.id`,
        [accountId],
      );
      if (!done[0]) return null;
      const rows = await db.query<AccountSql>(`select ${ACCOUNT_COLS} from account where id = $1`, [accountId]);
      return rows[0] ? toAccountDto(rows[0]) : null;
    },

    async values(accountId) {
      const rows = await db.query<{ as_of: string; value_cents: string | number }>(
        `select to_char(as_of, 'YYYY-MM-DD') as as_of, value_cents::text as value_cents
         from account_value where account_id = $1 order by as_of desc`,
        [accountId],
      );
      return rows.map((r) => ({ asOf: r.as_of, valueCents: Number(r.value_cents) }));
    },

    async remove(accountId) {
      const rows = await db.query<{ id: number }>(
        `delete from account where id = $1 and source = 'manual' returning id`,
        [accountId],
      );
      return rows.length > 0;
    },

    async holdings(accountId) {
      const rows = await db.query<{ symbol: string; units: string; aud_cents: string | number }>(
        `select symbol, units, aud_cents::text as aud_cents from account_holding
         where account_id = $1 order by aud_cents desc, symbol`,
        [accountId],
      );
      return rows.map((r) => ({ symbol: r.symbol, units: r.units, audCents: Number(r.aud_cents) }));
    },
  };
}
