import { categorise, detectFlows, type Flow } from '@curly/core';
import type { CarriedEdit, Repo } from '../db/repo';

/** Calls the pipeline can make in a normal run; callers only start it with at least this many left. */
export const PIPELINE_CALLS = 12;
/** Rows categorised per run, oldest first; the rest wait for the next run. */
const BATCH = 1000;
const PAIR_DAYS = 3;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/**
 * Categorises rows not yet categorised, then re-detects transfers from `since` (null: all history). Uses a fixed
 * number of queries: three reads for the rules, one to carry the owner's edits from replaced rows, one read and one
 * write for categorisation, one read and usually one write for flows. `more` is true when uncategorised rows remain.
 */
export async function runPipeline(
  repo: Repo,
  opts: { since: string | null; carried?: CarriedEdit[] },
): Promise<{ categorised: number; flowsChanged: number; more: boolean }> {
  const categories = await repo.listCategories();
  const rules = await repo.listRules();
  const pastByMerchant = await repo.pastByMerchant();

  // Before categorising, so a carried category is the owner's and the pipeline leaves it alone.
  if (opts.carried?.length) await repo.carryEdits(opts.carried);

  const batch = await repo.uncategorisedForPipeline(BATCH + 1);
  const more = batch.length > BATCH;
  const todo = batch.slice(0, BATCH);
  const ctx = { rules, pastByMerchant, categoryIdByName: new Map(categories.map((c) => [c.name, c.id])) };
  if (todo.length) await repo.applyCategorisation(todo.map((t) => ({ id: t.id, ...categorise(t, ctx) })));

  // Rows categorised for the first time also need their flows, even if this sync did not touch them.
  const earliest = todo[0]?.date;
  const since = opts.since !== null && earliest !== undefined && earliest < opts.since ? earliest : opts.since;
  const txns = await repo.flowTxnsSince(since === null ? '0001-01-01' : addDays(since, -PAIR_DAYS));
  const current = new Map(txns.map((t) => [t.id, t]));
  const decisions = new Map<number, { flow: Flow; pairId: number | null }>();
  for (const [id, d] of detectFlows(txns)) {
    const t = current.get(id)!;
    if (since !== null && t.date < since) continue;
    // An automatic row that stays normal has no pair, so there is nothing to write.
    if (d.flow === 'normal' && t.flow === 'normal') continue;
    decisions.set(id, d);
  }
  const flowsChanged = decisions.size ? await repo.applyFlows(decisions) : 0;

  return { categorised: todo.length, flowsChanged, more };
}
