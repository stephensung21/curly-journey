export const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function isStale(lastSuccessAt: Date | null, now: Date): boolean {
  if (lastSuccessAt === null) return true;
  return now.getTime() - lastSuccessAt.getTime() > STALE_AFTER_MS;
}
