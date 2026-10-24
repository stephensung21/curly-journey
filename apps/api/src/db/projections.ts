import type { Db } from './db';

export type Frequency = 'weekly' | 'fortnightly' | 'monthly';

export type ProjectionProfile = {
  birthDate: string | null;
  taxRateBps: number | null;
  mortgageRateBps: number | null;
  repaymentCents: number | null;
  repaymentFrequency: Frequency;
  termMonths: number | null;
  offsetGrowthCents: number;
  returnBps: number;
  inflationBps: number;
  distributionYieldBps: number;
  targetCents: number;
  targetAge: number;
  todaysDollars: boolean;
};

export type Prefill = { etfStartCents: number; mortgageBalanceCents: number; offsetCents: number };
export type TradeFlow = { date: string; side: 'buy' | 'sell'; totalCents: number };

/** camelCase profile field to its column. */
export const PROFILE_COLUMNS: Record<keyof ProjectionProfile, string> = {
  birthDate: 'birth_date',
  taxRateBps: 'tax_rate_bps',
  mortgageRateBps: 'mortgage_rate_bps',
  repaymentCents: 'repayment_cents',
  repaymentFrequency: 'repayment_frequency',
  termMonths: 'term_months',
  offsetGrowthCents: 'offset_growth_cents',
  returnBps: 'return_bps',
  inflationBps: 'inflation_bps',
  distributionYieldBps: 'distribution_yield_bps',
  targetCents: 'target_cents',
  targetAge: 'target_age',
  todaysDollars: 'todays_dollars',
};

type ProfileRow = {
  birth_date: string | null; tax_rate_bps: number | null; mortgage_rate_bps: number | null;
  repayment_cents: string | null; repayment_frequency: Frequency; term_months: number | null;
  offset_growth_cents: string; return_bps: number; inflation_bps: number; distribution_yield_bps: number;
  target_cents: string; target_age: number; todays_dollars: boolean;
};

const PROFILE_SELECT = `to_char(birth_date, 'YYYY-MM-DD') as birth_date, tax_rate_bps, mortgage_rate_bps,
  repayment_cents::text as repayment_cents, repayment_frequency, term_months, offset_growth_cents::text as offset_growth_cents,
  return_bps, inflation_bps, distribution_yield_bps, target_cents::text as target_cents, target_age, todays_dollars`;

const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

const toProfile = (r: ProfileRow): ProjectionProfile => ({
  birthDate: r.birth_date,
  taxRateBps: num(r.tax_rate_bps),
  mortgageRateBps: num(r.mortgage_rate_bps),
  repaymentCents: num(r.repayment_cents),
  repaymentFrequency: r.repayment_frequency,
  termMonths: num(r.term_months),
  offsetGrowthCents: Number(r.offset_growth_cents),
  returnBps: Number(r.return_bps),
  inflationBps: Number(r.inflation_bps),
  distributionYieldBps: Number(r.distribution_yield_bps),
  targetCents: Number(r.target_cents),
  targetAge: Number(r.target_age),
  todaysDollars: r.todays_dollars,
});

export type ProjectionsRepo = {
  /** One query. */
  profile(): Promise<ProjectionProfile>;
  /** One query: balance sums for the projection pre-fill. */
  prefill(): Promise<Prefill>;
  /** One query: CommSec trades, newest first. */
  commsecTrades(): Promise<TradeFlow[]>;
  /** One query. Applies the given fields and returns the updated profile. */
  update(patch: Partial<ProjectionProfile>): Promise<ProjectionProfile>;
};

export function makeProjectionsRepo(db: Db): ProjectionsRepo {
  return {
    async profile() {
      const rows = await db.query<ProfileRow>(`select ${PROFILE_SELECT} from projection_profile where id = 1`);
      return toProfile(rows[0]!);
    },

    async prefill() {
      const rows = await db.query<{ etf: string; mortgage: string; offset: string }>(
        `select coalesce(sum(balance_cents) filter (where projections = 'etf'), 0)::text as etf,
                coalesce(-sum(balance_cents) filter (where projections = 'mortgage' and kind = 'mortgage'), 0)::text as mortgage,
                coalesce(sum(balance_cents) filter (where is_offset), 0)::text as "offset"
         from account`,
      );
      const r = rows[0]!;
      return {
        etfStartCents: Number(r.etf),
        mortgageBalanceCents: Math.max(0, Number(r.mortgage)),
        offsetCents: Math.max(0, Number(r.offset)),
      };
    },

    async commsecTrades() {
      const rows = await db.query<{ date: string; side: 'buy' | 'sell'; total_cents: string }>(
        `select to_char(t.date, 'YYYY-MM-DD') as date, t.side, t.total_cents::text as total_cents
         from trade t join account a on a.id = t.account_id where a.source = 'commsec' order by t.date desc`,
      );
      return rows.map((r) => ({ date: r.date, side: r.side, totalCents: Number(r.total_cents) }));
    },

    async update(patch) {
      const sets: string[] = [];
      const params: unknown[] = [];
      for (const [k, v] of Object.entries(patch) as [keyof ProjectionProfile, unknown][]) {
        params.push(v);
        sets.push(`${PROFILE_COLUMNS[k]} = $${params.length}`);
      }
      sets.push('updated_at = now()');
      const rows = await db.query<ProfileRow>(
        `update projection_profile set ${sets.join(', ')} where id = 1 returning ${PROFILE_SELECT}`,
        params,
      );
      return toProfile(rows[0]!);
    },
  };
}
