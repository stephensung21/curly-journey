import { defaultCounts, sydneyDate, type ParsedTrade } from '@curly/core';
import type { Db } from './db';

export type TradeRow = ParsedTrade & { id: number; source: 'csv' | 'manual' };
export type NewTrade = ParsedTrade & { source: 'csv' | 'manual'; fingerprint: string };
export type Close = { closeMicros: number; date: string };

export type HoldingsRepo = {
  commsecAccountId(): Promise<number | null>;
  ensureCommsecAccount(now: Date): Promise<number>;
  trades(accountId: number): Promise<TradeRow[]>;
  /** One query. */
  existingFingerprints(fps: string[]): Promise<Set<string>>;
  /** One bulk insert; returns how many rows were new. */
  insertTrades(accountId: number, rows: NewTrade[]): Promise<number>;
  deleteTrade(id: number): Promise<boolean>;
  /** One query: the newest stored close per symbol. */
  latestCloses(symbols: string[]): Promise<Map<string, Close>>;
  /** One bulk query. */
  upsertPrices(rows: { symbol: string; date: string; closeMicros: number }[]): Promise<void>;
  setCommsecBalance(accountId: number, valueCents: number, date: string): Promise<void>;
  dismissHint(transactionId: number): Promise<void>;
};

export function makeHoldingsRepo(db: Db): HoldingsRepo {
  return {
    async commsecAccountId() {
      const rows = await db.query<{ id: number }>("select id from account where source = 'commsec' and external_id = 'commsec'");
      return rows[0]?.id ?? null;
    },

    async ensureCommsecAccount(now) {
      const c = defaultCounts('brokerage');
      const rows = await db.query<{ id: number }>(
        `insert into account (source, external_id, institution, name, kind, balance_cents, balance_date,
                              counts_spending, counts_net_worth, projections, synced_at)
         values ('commsec', 'commsec', 'CommSec', 'CommSec', 'brokerage', 0, $1::date, $2, $3, $4, $5)
         on conflict (source, external_id) do update set institution = account.institution
         returning id`,
        [sydneyDate(now), c.countsSpending, c.countsNetWorth, c.projections, now],
      );
      return rows[0]!.id;
    },

    async trades(accountId) {
      const rows = await db.query<{
        id: number;
        date: string;
        side: 'buy' | 'sell';
        symbol: string;
        units: number;
        price_micros: string | number;
        brokerage_cents: string | number;
        total_cents: string | number;
        source: 'csv' | 'manual';
      }>(
        `select id, to_char(date, 'YYYY-MM-DD') as date, side, symbol, units,
                price_micros::text as price_micros, brokerage_cents::text as brokerage_cents,
                total_cents::text as total_cents, source
         from trade where account_id = $1 order by date, id`,
        [accountId],
      );
      return rows.map((r) => ({
        id: r.id,
        date: r.date,
        reference: null,
        side: r.side,
        symbol: r.symbol,
        units: r.units,
        priceMicros: Number(r.price_micros),
        brokerageCents: Number(r.brokerage_cents),
        totalCents: Number(r.total_cents),
        source: r.source,
      }));
    },

    async existingFingerprints(fps) {
      if (!fps.length) return new Set();
      const rows = await db.query<{ fingerprint: string }>('select fingerprint from trade where fingerprint = any($1::text[])', [fps]);
      return new Set(rows.map((r) => r.fingerprint));
    },

    async insertTrades(accountId, rows) {
      if (!rows.length) return 0;
      const inserted = await db.query<{ id: number }>(
        `insert into trade (account_id, date, side, symbol, units, price_micros, brokerage_cents, total_cents, source, fingerprint)
         select $1, t.date, t.side, t.symbol, t.units, t.price_micros, t.brokerage_cents, t.total_cents, t.source, t.fingerprint
         from unnest($2::date[], $3::text[], $4::text[], $5::int[], $6::bigint[], $7::bigint[], $8::bigint[], $9::text[], $10::text[])
           as t(date, side, symbol, units, price_micros, brokerage_cents, total_cents, source, fingerprint)
         on conflict (fingerprint) do nothing
         returning id`,
        [
          accountId,
          rows.map((r) => r.date),
          rows.map((r) => r.side),
          rows.map((r) => r.symbol),
          rows.map((r) => r.units),
          rows.map((r) => r.priceMicros),
          rows.map((r) => r.brokerageCents),
          rows.map((r) => r.totalCents),
          rows.map((r) => r.source),
          rows.map((r) => r.fingerprint),
        ],
      );
      return inserted.length;
    },

    async deleteTrade(id) {
      const rows = await db.query<{ id: number }>('delete from trade where id = $1 returning id', [id]);
      return rows.length > 0;
    },

    async latestCloses(symbols) {
      const out = new Map<string, Close>();
      if (!symbols.length) return out;
      const rows = await db.query<{ symbol: string; close_micros: string | number; date: string }>(
        `select distinct on (symbol) symbol, close_micros::text as close_micros, to_char(date, 'YYYY-MM-DD') as date
         from price where symbol = any($1::text[]) order by symbol, date desc`,
        [symbols],
      );
      for (const r of rows) out.set(r.symbol, { closeMicros: Number(r.close_micros), date: r.date });
      return out;
    },

    async upsertPrices(rows) {
      if (!rows.length) return;
      // One row per (symbol, date): Postgres rejects a conflict target hit twice in one statement.
      const unique = [...new Map(rows.map((r) => [`${r.symbol}|${r.date}`, r])).values()];
      await db.query(
        `insert into price (symbol, date, close_micros)
         select * from unnest($1::text[], $2::date[], $3::bigint[])
         on conflict (symbol, date) do update set close_micros = excluded.close_micros`,
        [unique.map((r) => r.symbol), unique.map((r) => r.date), unique.map((r) => r.closeMicros)],
      );
    },

    async setCommsecBalance(accountId, valueCents, date) {
      await db.query('update account set balance_cents = $2, balance_date = $3::date where id = $1', [accountId, valueCents, date]);
    },

    async dismissHint(transactionId) {
      await db.query(
        'insert into trade_hint_dismissed (transaction_id) select id from transaction where id = $1 on conflict do nothing',
        [transactionId],
      );
    },
  };
}
