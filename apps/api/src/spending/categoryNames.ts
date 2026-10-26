/**
 * Category id by every name a category answers to: its current name and its aliases (old names, and the names
 * of categories merged into it). A current name wins over another category's alias.
 */
export function categoryIdByName(categories: { id: number; name: string; aliases?: string[] }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of categories) for (const a of c.aliases ?? []) if (!map.has(a)) map.set(a, c.id);
  for (const c of categories) map.set(c.name, c.id);
  return map;
}
