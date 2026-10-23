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

  function checkOrigin(url: string): void {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      throw new Error('PocketSmith pagination returned an invalid next URL');
    }
    if (origin !== ORIGIN) throw new Error('PocketSmith pagination returned a next URL on an unexpected origin');
  }

  async function getPage<T>(url: string): Promise<{ items: T[]; next: string | null }> {
    checkOrigin(url);
    const res = await get(url);
    const items = (await res.json()) as T[];
    const next = nextUrl(res.headers.get('Link'));
    if (next) checkOrigin(next);
    return { items, next };
  }

  async function getAll<T>(first: string): Promise<T[]> {
    const out: T[] = [];
    const seen = new Set<string>();
    let url: string | null = first;
    while (url) {
      if (seen.has(url)) throw new Error('PocketSmith pagination loop detected');
      seen.add(url);
      const page: { items: T[]; next: string | null } = await getPage<T>(url);
      out.push(...page.items);
      url = page.next;
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
    transactionsPage(accountId, query, pageUrl) {
      if (pageUrl) return getPage<PsTransaction>(pageUrl);
      const q = new URLSearchParams({ per_page: '100' });
      if (query.updatedSince) q.set('updated_since', query.updatedSince);
      if (query.startDate) q.set('start_date', query.startDate);
      if (query.endDate) q.set('end_date', query.endDate);
      return getPage<PsTransaction>(`${BASE}/transaction_accounts/${accountId}/transactions?${q}`);
    },
  };
}
