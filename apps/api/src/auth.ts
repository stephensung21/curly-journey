import { createMiddleware } from 'hono/factory';
import type { Db } from './db/db';

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function bearerAuth(db: Db) {
  return createMiddleware(async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(header);
    if (!m) return c.body(null, 401);
    const rows = await db.query('select 1 from api_token where token_hash = $1', [await hashToken(m[1]!)]);
    if (rows.length === 0) return c.body(null, 401);
    await next();
  });
}
