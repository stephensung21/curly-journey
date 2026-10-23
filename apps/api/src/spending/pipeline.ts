import { categorise, cleanMerchant, detectFlows, type Flow } from '@curly/core';
import type { Repo } from '../db/repo';

/**
 * Calls the pipeline makes in a normal run (8), with room for extra flow chunks. Callers only start it with at least
 * this many left.
 */
export const PIPELINE_CALLS = 12;
/** Rows categorised per run, oldest first; the rest wait for the next run. */
const BATCH = 500;
const PAIR_DAYS = 3;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

/**
 * Carries the owner's edits from replaced rows onto their replacements, categorises rows not yet categorised, then
 * re-detects transfers from the earlier of `since` and the oldest row categorised now; with neither, flows are left
 * alone. Uses a fixed number of queries: one for the carried edits, three reads for the rules, one read and one write
 * for categorisation, one read and usually one write for flows. `more` is true when uncategorised rows remain.
 */
export async function runPipeline(
  repo: Repo,
  opts: { since: string | null; now: Date },
): Promise<{ categorised: number; flowsChanged: number; more: boolean }> {
  // First, so the pipeline sees the carried categories and flows as the owner's.
  await repo.applyCarriedEdits(opts.now);
  const categories = await repo.listCategories();
  const rules = await repo.listRules();
  const pastByMerchant = await repo.pastByMerchant();

  const batch = await repo.uncategorisedForPipeline(BATCH + 1);
  const more = batch.length > BATCH;
  const todo = batch.slice(0, BATCH);
  const ctx = { rules, pastByMerchant, categoryIdByName: new Map(categories.map((c) => [c.name, c.id])) };
  if (todo.length) {
    await repo.applyCategorisation(
      todo.map((t) => {
        // Rows synced before merchants existed have none: clean one from the description, and store it.
        const merchant = t.merchant || cleanMerchant(t.description);
        return { id: t.id, merchant, ...categorise({ ...t, merchant }, ctx) };
      }),
    );
  }

  // Rows categorised for the first time also need their flows, even if this sync did not touch them. With nothing
  // new at all, skip detection rather than scan all history.
  const earliest = todo[0]?.date ?? null;
  const since = opts.since === null || (earliest !== null && earliest < opts.since) ? earliest : opts.since;
  if (since === null) return { categorised: todo.length, flowsChanged: 0, more };

  const txns = await repo.flowTxnsSince(addDays(since, -PAIR_DAYS));
  const current = new Map(txns.map((t) => [t.id, t]));
  const detected = detectFlows(txns);
  const decisions = new Map<number, { flow: Flow; pairId: number | null }>();
  const keep = (id: number) => {
    const d = detected.get(id);
    // An automatic row that stays normal has no pair, so there is nothing to write.
    if (d && !(d.flow === 'normal' && current.get(id)!.flow === 'normal')) decisions.set(id, d);
  };
  for (const [id, d] of detected) {
    if (current.get(id)!.date < since) continue;
    keep(id);
    // A partner dated before `since` changes with it, or one side of the transfer would still count as spending.
    if (d.pairId !== null) keep(d.pairId);
  }
  const flowsChanged = decisions.size ? await repo.applyFlows(decisions) : 0;

  return { categorised: todo.length, flowsChanged, more };
}
