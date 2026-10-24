import type { SpendingLimit } from '@curly/core';
import type { Db } from './db';

type LimitRow = { id: number; category_id: number | null; amount_cents: string; warn_percent: number };

const COLS = 'id, category_id, amount_cents::text as amount_cents, warn_percent';

const toLimit = (r: LimitRow): SpendingLimit => ({
  id: r.id,
  categoryId: r.category_id,
  amountCents: Number(r.amount_cents),
  warnPercent: r.warn_percent,
});

export interface LimitsRepo {
  list(): Promise<SpendingLimit[]>;
  /** Null when the category (or the whole month) already has a limit. */
  create(l: Omit<SpendingLimit, 'id'>): Promise<SpendingLimit | null>;
  update(id: number, patch: { amountCents?: number; warnPercent?: number }): Promise<SpendingLimit | null>;
  remove(id: number): Promise<boolean>;
  /** Limit id to the latest alert time (ISO) among its `limit:{id}:{month}:*` log keys. */
  alertedAt(month: string): Promise<Map<number, string>>;
}

export function makeLimitsRepo(db: Db): LimitsRepo {
  return {
    async list() {
      const rows = await db.query<LimitRow>(`select ${COLS} from spending_limit order by id`);
      return rows.map(toLimit);
    },

    async create(l) {
      const rows = await db.query<LimitRow>(
        `insert into spending_limit (category_id, amount_cents, warn_percent) values ($1, $2, $3)
         on conflict do nothing returning ${COLS}`,
        [l.categoryId, l.amountCents, l.warnPercent],
      );
      return rows[0] ? toLimit(rows[0]) : null;
    },

    async update(id, patch) {
      const rows = await db.query<LimitRow>(
        `update spending_limit
            set amount_cents = coalesce($2::bigint, amount_cents),
                warn_percent = coalesce($3::int, warn_percent)
          where id = $1 returning ${COLS}`,
        [id, patch.amountCents ?? null, patch.warnPercent ?? null],
      );
      return rows[0] ? toLimit(rows[0]) : null;
    },

    async remove(id) {
      return (await db.query('delete from spending_limit where id = $1 returning id', [id])).length > 0;
    },

    async alertedAt(month) {
      const rows = await db.query<{ id: number; sent_at: string }>(
        `select l.id,
                to_char(max(n.sent_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as sent_at
           from spending_limit l
           join notification_log n on n.key like 'limit:' || l.id || ':' || $1 || ':%'
          group by l.id`,
        [month],
      );
      return new Map(rows.map((r) => [r.id, r.sent_at]));
    },
  };
}
