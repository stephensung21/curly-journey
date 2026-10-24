import { avgMonthlyInvestmentCents, sydneyDate } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeProjectionsRepo, PROFILE_COLUMNS, type ProjectionProfile, type StoredProfile } from '../db/projections';
import { isObject, readJson } from './http';

const MAX = Number.MAX_SAFE_INTEGER;
const int = (min: number, max: number) => (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

type Rule = { nullable: boolean; ok: (v: unknown, today: string) => boolean };

const isRealDate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

const RULES: Record<keyof ProjectionProfile, Rule> = {
  birthDate: { nullable: true, ok: (v, today) => typeof v === 'string' && isRealDate(v) && v <= today },
  taxRateBps: { nullable: true, ok: int(0, 6000) },
  mortgageRateBps: { nullable: true, ok: int(0, 2000) },
  repaymentCents: { nullable: true, ok: int(1, MAX) },
  repaymentFrequency: { nullable: false, ok: (v) => v === 'weekly' || v === 'fortnightly' || v === 'monthly' },
  termMonths: { nullable: true, ok: int(1, 600) },
  offsetGrowthCents: { nullable: false, ok: int(-MAX, MAX) },
  returnBps: { nullable: false, ok: int(0, 2000) },
  inflationBps: { nullable: false, ok: int(0, 1000) },
  distributionYieldBps: { nullable: false, ok: int(0, 1500) },
  targetCents: { nullable: false, ok: int(1, MAX) },
  targetAge: { nullable: false, ok: int(18, 100) },
  todaysDollars: { nullable: false, ok: (v) => typeof v === 'boolean' },
};

export function projectionRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeProjectionsRepo(deps.db);

  r.get('/projections', async (c) => {
    const today = sydneyDate(deps.now());
    // Three queries (plus auth): stays well inside the Workers Free subrequest limit.
    const [profile, prefill, trades] = await Promise.all([repo.profile(), repo.prefill(), repo.commsecTrades()]);
    const etfMonthlyCents = Math.max(0, avgMonthlyInvestmentCents(trades, today));
    return c.json({ profile, prefill: { ...prefill, etfMonthlyCents, today } });
  });

  r.put('/projections/profile', async (c) => {
    const body = await readJson(c);
    if (!isObject(body)) return c.json({ error: 'bad_profile' }, 400);
    const today = sydneyDate(deps.now());
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!Object.hasOwn(PROFILE_COLUMNS, k)) return c.json({ error: 'bad_profile' }, 400);
      const rule = RULES[k as keyof ProjectionProfile];
      if (v === null ? !rule.nullable : !rule.ok(v, today)) return c.json({ error: 'bad_profile' }, 400);
      patch[k] = v;
    }
    // The term counts down from the day it was saved, so stamp (or clear) that day with it.
    if (Object.hasOwn(patch, 'termMonths')) patch.termSetOn = patch.termMonths === null ? null : today;
    return c.json(await repo.update(patch as Partial<StoredProfile>));
  });

  return r;
}
