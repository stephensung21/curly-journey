export const LOCK_TIMEOUT_MS = 300_000;

/** Lock on cold start (never backgrounded) or after 5+ minutes away. */
export function shouldLock(backgroundedAt: number | null, now: number, timeoutMs = LOCK_TIMEOUT_MS): boolean {
  if (backgroundedAt === null) return true;
  return now - backgroundedAt >= timeoutMs;
}
