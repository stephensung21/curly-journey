import type { PushClient, PushMessage } from './types';

export type { PushClient, PushMessage } from './types';

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_PER_REQUEST = 100;

export class PushError extends Error {
  constructor(readonly status: number) {
    super(`push failed (${status})`);
  }
}

type Ticket = { status?: string; details?: { error?: string } };

export function expoPush(accessToken?: string, fetchImpl: typeof fetch = (url, init) => fetch(url, init)): PushClient {
  return {
    async send(tokens, messages) {
      const entries = tokens
        .flatMap((to) =>
          messages.map((m: PushMessage) => ({
            to,
            title: m.title,
            body: m.body,
            data: { url: m.url },
            sound: 'default',
            channelId: 'default',
          })),
        )
        .slice(0, MAX_PER_REQUEST);
      if (entries.length === 0) return { invalidTokens: [] };
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      const res = await fetchImpl(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(entries) });
      if (!res.ok) throw new PushError(res.status);
      const json = (await res.json().catch(() => null)) as { data?: Ticket[] } | null;
      const invalid = new Set<string>();
      (json?.data ?? []).forEach((t, i) => {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' && entries[i]) invalid.add(entries[i].to);
      });
      return { invalidTokens: [...invalid] };
    },
  };
}
