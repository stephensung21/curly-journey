import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CoinSpotError, coinSpotClient } from '../src/coinspot/client';

const KEY = 'test-key-not-real';
const SECRET = 'test-secret-not-real';

function fakeFetch(res: { status?: number; body: unknown }) {
  const seen: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify(res.body), { status: res.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, seen };
}

describe('coinSpotClient', () => {
  it('signs the exact body with HMAC-SHA512 and maps balances, dropping zeros', async () => {
    const f = fakeFetch({
      body: {
        status: 'ok',
        balances: [
          { BTC: { balance: 0.5, audbalance: 30000.12, rate: 60000.24 } },
          { AUD: { balance: 12.5, audbalance: 12.5, rate: 1 } },
          { ETH: { balance: 0, audbalance: 0, rate: 3000 } },
        ],
      },
    });
    const out = await coinSpotClient(KEY, SECRET, f.impl).balances();
    expect(out).toEqual([
      { symbol: 'BTC', units: '0.5', audCents: 3000012 },
      { symbol: 'AUD', units: '12.5', audCents: 1250 },
    ]);
    const { url, init } = f.seen[0]!;
    expect(url).toBe('https://www.coinspot.com.au/api/v2/ro/my/balances');
    expect(init.method).toBe('POST');
    const body = init.body as string;
    expect(typeof JSON.parse(body).nonce).toBe('number');
    const headers = init.headers as Record<string, string>;
    expect(headers.key).toBe(KEY);
    expect(headers.sign).toBe(createHmac('sha512', SECRET).update(body).digest('hex'));
  });

  it('throws CoinSpotError with the HTTP status', async () => {
    const f = fakeFetch({ status: 401, body: {} });
    await expect(coinSpotClient(KEY, SECRET, f.impl).balances()).rejects.toMatchObject({ name: 'CoinSpotError', status: 401 });
    await expect(coinSpotClient(KEY, SECRET, f.impl).balances()).rejects.toBeInstanceOf(CoinSpotError);
  });

  it('throws when status is not ok', async () => {
    const f = fakeFetch({ body: { status: 'error', message: 'nope' } });
    await expect(coinSpotClient(KEY, SECRET, f.impl).balances()).rejects.toBeInstanceOf(CoinSpotError);
  });
});
