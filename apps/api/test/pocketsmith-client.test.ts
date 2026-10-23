import { describe, expect, it } from 'vitest';
import { pocketSmithClient } from '../src/pocketsmith/client';

describe('pocketSmithClient', () => {
  it('fetches one page with filters, returns the next link, and sends the key', async () => {
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
    const p1 = await c.transactionsPage(9, { updatedSince: '2026-01-01T00:00:00.000Z', startDate: '2026-07-01', endDate: '2026-09-28' });
    expect(p1.items.map((r) => r.id)).toEqual([1]);
    expect(p1.next).toBe('https://api.pocketsmith.com/v2/transaction_accounts/9/transactions?page=2');
    expect(seen[0]!.url).toContain('/transaction_accounts/9/transactions');
    expect(seen[0]!.url).toContain('per_page=100');
    expect(seen[0]!.url).toContain('updated_since=');
    expect(seen[0]!.url).toContain('start_date=2026-07-01');
    expect(seen[0]!.url).toContain('end_date=2026-09-28');
    const p2 = await c.transactionsPage(9, {}, p1.next!);
    expect(p2).toEqual({ items: [{ id: 2 }], next: null });
    expect(seen[1]!.url).toBe('https://api.pocketsmith.com/v2/transaction_accounts/9/transactions?page=2');
    for (const s of seen) {
      expect(s.headers.get('X-Developer-Key')).toBe('secret-key');
      expect(s.headers.get('Accept')).toBe('application/json');
    }
  });

  it('fetches a page of the user-level transactions endpoint with a date range', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify([{ id: 1 }]), {
        headers: { Link: '<https://api.pocketsmith.com/v2/users/4/transactions?page=2>; rel="next"' },
      });
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const p1 = await c.userTransactionsPage(4, { startDate: '2026-10-09', endDate: '2026-10-23' });
    expect(p1).toEqual({ items: [{ id: 1 }], next: 'https://api.pocketsmith.com/v2/users/4/transactions?page=2' });
    expect(urls[0]).toBe('https://api.pocketsmith.com/v2/users/4/transactions?per_page=100&start_date=2026-10-09&end_date=2026-10-23');
    await c.userTransactionsPage(4, {}, p1.next!);
    expect(urls[1]).toBe('https://api.pocketsmith.com/v2/users/4/transactions?page=2');
    expect(await c.userTransactionsPage(4, {}, 'https://evil.example.com/x').catch((e: Error) => e)).toBeInstanceOf(Error);
    expect(urls).toHaveLength(2);
  });

  it('throws with status but not the key on non-2xx', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.me().catch((e: Error) => e);
    expect((err as Error).message).toContain('403');
    expect((err as Error).message).not.toContain('secret-key');
  });

  it('refuses a next link on another origin', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response('[]', { headers: { Link: '<https://evil.example.com/x?page=2>; rel="next"' } });
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.transactionsPage(9, {}).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('secret-key');
    expect(urls).toHaveLength(1);
  });

  it('never sends the key to a page URL on another origin', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return new Response('[]');
    }) as unknown as typeof fetch;
    const c = pocketSmithClient('secret-key', fetchImpl);
    const err = await c.transactionsPage(9, {}, 'https://evil.example.com/x?page=2').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(urls).toHaveLength(0);
  });
});
