/**
 * The full order after reordering a subset of it: the slots the subset held are refilled in the subset's new order,
 * and every other id stays where it was. Subset ids missing from `full` go at the end.
 */
export function slotOrder(full: readonly number[], subset: readonly number[]): number[] {
  const known = new Set(full);
  const queue = subset.filter(id => known.has(id));
  const inSubset = new Set(queue);
  const out = full.map(id => (inSubset.has(id) ? queue.shift()! : id));
  return [...out, ...subset.filter(id => !known.has(id))];
}
