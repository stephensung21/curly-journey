import type { Context } from 'hono';

export const parseId = (s: string): number | null =>
  /^\d+$/.test(s) && Number(s) <= Number.MAX_SAFE_INTEGER ? Number(s) : null;

export const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The request's JSON body, or undefined when it is not valid JSON. */
export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
