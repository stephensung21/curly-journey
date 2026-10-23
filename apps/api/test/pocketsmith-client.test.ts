import { describe, expect, it } from 'vitest';
import { pocketSmithClient } from '../src/pocketsmith/client';

describe('pocketSmithClient', () => {
  it('follows Link rel=next and sends the key', async () => {
    const seen: { url: string; headers: Headers }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: new Headers(init?.headers) });
      if (!url.includes('page=2')) {
        return new Response(JSON.stringify([{ id: 1 }]), {
          headers: { Link: '<https://api.pocketsmith.com/v2/transaction_accounts/9/transactions?page=2>; rel="next", <https://x/?page=5>; rel="last"' },
        });
      }
      return new Response(JSON.stringify([{ id: 2 }]));
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const rows = await c.transactions(9, { updatedSince: '2026-01-01T00:00:00.000Z' });
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
    expect(seen[0]!.url).toContain('/transaction_accounts/9/transactions');
    expect(seen[0]!.url).toContain('per_page=100');
    expect(seen[0]!.url).toContain('updated_since=');
    expect(seen[1]!.url).toBe('https://api.pocketsmith.com/v2/transaction_accounts/9/transactions?page=2');
    for (const s of seen) {
      expect(s.headers.get('X-Developer-Key')).toBe('secret-key');
      expect(s.headers.get('Accept')).toBe('application/json');
    }
  });

  it('throws with status but not the key on non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.me().catch((e: Error) => e);
    expect((err as Error).message).toContain('403');
    expect((err as Error).message).not.toContain('secret-key');
  });

  it('throws on a repeated next URL', async () => {
    const u = 'https://api.pocketsmith.com/v2/transaction_accounts/9/transactions?page=2';
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return new Response('[]', { headers: { Link: `<${u}>; rel="next"` } });
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.transactions(9, {}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('secret-key');
    expect(n).toBeLessThanOrEqual(3);
  });

  it('refuses a next URL on another origin and never sends the key there', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response('[]', { headers: { Link: '<https://evil.example.com/x?page=2>; rel="next"' } });
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.transactions(9, {}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('secret-key');
    expect(urls).toHaveLength(1);
  });
});
