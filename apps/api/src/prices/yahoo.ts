import { sydneyDate } from '@curly/core';

export type PriceClient = { closes(symbol: string): Promise<{ date: string; closeMicros: number }[]> };

/** Carries only the HTTP status, so logging it can never echo a URL or a body. */
export class PriceError extends Error {
  constructor(readonly status: number) {
    super(`price http ${status}`);
  }
}

type Chart = { chart?: { result?: { timestamp?: unknown; indicators?: { quote?: { close?: unknown }[] } }[] | null } };

/** Daily closes for ASX symbols from Yahoo's chart endpoint. ASX symbols take a `.AX` suffix, added only here. */
export function yahooPrices(fetchImpl: typeof fetch = fetch): PriceClient {
  return {
    async closes(symbol) {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.AX?range=1mo&interval=1d`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'curly-journey/1' }, signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new PriceError(res.status);
      const body = (await res.json()) as Chart;
      const result = body.chart?.result?.[0];
      const ts = result?.timestamp;
      const close = result?.indicators?.quote?.[0]?.close;
      if (!Array.isArray(ts) || !Array.isArray(close)) throw new PriceError(0);
      const out: { date: string; closeMicros: number }[] = [];
      ts.forEach((t, i) => {
        const c = close[i];
        if (typeof t !== 'number' || typeof c !== 'number' || !Number.isFinite(c)) return;
        out.push({ date: sydneyDate(new Date(t * 1000)), closeMicros: Math.round(c * 1e6) });
      });
      return out;
    },
  };
}
