import type { PsTransaction, PsTransactionAccount } from '@curly/core';
import type { PocketSmithClient } from './index';

const BASE = 'https://api.pocketsmith.com/v2';

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
    let url: string | null = first;
    while (url) {
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
