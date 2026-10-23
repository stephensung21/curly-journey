import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import type { PocketSmithClient } from './index';

const ORIGIN = 'https://api.pocketsmith.com';
const BASE = `${ORIGIN}/v2`;

function nextUrl(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(/,\s*(?=<)/)) {
    const m = /^\s*<([^>]+)>\s*;(.*)$/.exec(part);
    if (m && /rel="?next"?/.test(m[2]!)) return m[1]!;
  }
  return null;
}

export function pocketSmithClient(key: string, fetchImpl: typeof fetch = fetch): PocketSmithClient {
  async function get(url: string): Promise<Response> {
    const res = await fetchImpl(url, { headers: { 'X-Developer-Key': key, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`PocketSmith request failed with status ${res.status}`);
    return res;
  }

  async function getAll<T>(first: string): Promise<T[]> {
    const out: T[] = [];
    const seen = new Set<string>();
    let url: string | null = first;
    while (url) {
      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        throw new Error('PocketSmith pagination returned an invalid next URL');
      }
      if (origin !== ORIGIN) throw new Error('PocketSmith pagination returned a next URL on an unexpected origin');
      if (seen.has(url)) throw new Error('PocketSmith pagination loop detected');
      seen.add(url);
      const res = await get(url);
      out.push(...((await res.json()) as T[]));
      url = nextUrl(res.headers.get('Link'));
    }
    return out;
  }

  return {
    async me() {
      const res = await get(`${BASE}/me`);
      return { id: ((await res.json()) as { id: number }).id };
    },
    transactionAccounts(userId) {
      return getAll<PsTransactionAccount>(`${BASE}/users/${userId}/transaction_accounts?per_page=100`);
    },
    transactions(accountId, opts) {
      const q = new URLSearchParams({ per_page: '100' });
      if (opts.updatedSince) q.set('updated_since', opts.updatedSince);
      return getAll<PsTransaction>(`${BASE}/transaction_accounts/${accountId}/transactions?${q}`);
    },
  };
}
