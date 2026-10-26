import type { Db } from './db';

export type Goal = {
  id: number;
  name: string;
  emoji: string;
  targetCents: number;
  targetDate: string | null;
  /** Empty: net worth. */
  accountIds: number[];
};

type GoalRow = { id: number; name: string; emoji: string; target_cents: string; target_date: string | null; account_ids: number[] };

const COLS = `id, name, emoji, target_cents::text as target_cents, to_char(target_date, 'YYYY-MM-DD') as target_date, account_ids`;

const toGoal = (r: GoalRow): Goal => ({
  id: Number(r.id),
  name: r.name,
  emoji: r.emoji,
  targetCents: Number(r.target_cents),
  targetDate: r.target_date,
  accountIds: r.account_ids.map(Number),
});

export interface GoalsRepo {
  list(): Promise<Goal[]>;
  create(g: Omit<Goal, 'id'>): Promise<Goal>;
  /** Null when the goal does not exist. */
  update(id: number, patch: Partial<Omit<Goal, 'id'>>): Promise<Goal | null>;
  remove(id: number): Promise<boolean>;
  /** One query: balances of the accounts that count towards net worth, with whether each is invested (ETFs or crypto). */
  balances(): Promise<{ id: number; balanceCents: number; invested: boolean }[]>;
  /** Which of these account ids exist. */
  existingAccounts(ids: number[]): Promise<Set<number>>;
}

const COLUMNS = { name: 'name', emoji: 'emoji', targetCents: 'target_cents', targetDate: 'target_date', accountIds: 'account_ids' } as const;
const CASTS: Partial<Record<keyof typeof COLUMNS, string>> = { targetDate: '::date', accountIds: '::int[]' };

export function makeGoalsRepo(db: Db): GoalsRepo {
  return {
    async list() {
      return (await db.query<GoalRow>(`select ${COLS} from goal order by id`)).map(toGoal);
    },

    async create(g) {
      const rows = await db.query<GoalRow>(
        `insert into goal (name, emoji, target_cents, target_date, account_ids)
         values ($1, $2, $3, $4::date, $5::int[]) returning ${COLS}`,
        [g.name, g.emoji, g.targetCents, g.targetDate, g.accountIds],
      );
      return toGoal(rows[0]!);
    },

    async update(id, patch) {
      const sets: string[] = [];
      const params: unknown[] = [id];
      for (const key of Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]) {
        if (patch[key] === undefined) continue;
        params.push(patch[key]);
        sets.push(`${COLUMNS[key]} = $${params.length}${CASTS[key] ?? ''}`);
      }
      const rows = sets.length
        ? await db.query<GoalRow>(`update goal set ${sets.join(', ')} where id = $1 returning ${COLS}`, params)
        : await db.query<GoalRow>(`select ${COLS} from goal where id = $1`, [id]);
      return rows[0] ? toGoal(rows[0]) : null;
    },

    async remove(id) {
      return (await db.query('delete from goal where id = $1 returning id', [id])).length > 0;
    },

    async balances() {
      const rows = await db.query<{ id: number; balance_cents: string; invested: boolean }>(
        `select id, balance_cents::text as balance_cents, (kind in ('brokerage', 'crypto') or projections = 'etf') as invested
         from account where counts_net_worth`,
      );
      return rows.map((r) => ({ id: Number(r.id), balanceCents: Number(r.balance_cents), invested: r.invested }));
    },

    async existingAccounts(ids) {
      if (!ids.length) return new Set();
      const rows = await db.query<{ id: number }>('select id from account where id = any($1::int[])', [ids]);
      return new Set(rows.map((r) => Number(r.id)));
    },
  };
}
