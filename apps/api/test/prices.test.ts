import { describe, expect, it, vi } from 'vitest';
import { yahooPrices } from '../src/prices/yahoo';

// 2026-10-22 03:00 UTC and 2026-10-23 03:00 UTC (both 14:00 Sydney the same day)
const T1 = Date.UTC(2026, 9, 22, 3) / 1000;
const T2 = Date.UTC(2026, 9, 23, 3) / 1000;
const payload = (close: (number | null)[]) => ({
  chart: { result: [{ timestamp: [T1, T2, T2 + 86400].slice(0, close.length), indicators: { quote: [{ close }] } }] },
});
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe('yahooPrices', () => {
  it('reads closes as micros keyed by Sydney date, with the .AX suffix and user agent', async () => {
    const f = ok(payload([102.45, 103.1]));
    const out = await yahooPrices(f as unknown as typeof fetch).closes('VAS');
    expect(out).toEqual([
      { date: '2026-10-22', closeMicros: 102_450_000 },
      { date: '2026-10-23', closeMicros: 103_100_000 },
    ]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/VAS.AX?');
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('curly-journey/1');
  });

  it('rounds float32 noise in closes to 4 decimal places', async () => {
    const out = await yahooPrices(ok(payload([102.44999694824219])) as unknown as typeof fetch).closes('VAS');
    expect(out).toEqual([{ date: '2026-10-22', closeMicros: 102_450_000 }]);
  });

  it('dates a bar stamped 23:00 UTC the previous day to the next Sydney day', async () => {
    const body = { chart: { result: [{ timestamp: [Date.UTC(2026, 9, 21, 23) / 1000], indicators: { quote: [{ close: [1] }] } }] } };
    const out = await yahooPrices(ok(body) as unknown as typeof fetch).closes('VAS');
    expect(out).toEqual([{ date: '2026-10-22', closeMicros: 1_000_000 }]);
  });

  it('skips null and NaN closes', async () => {
    const f = ok(payload([null, 103.1, Number.NaN]));
    const out = await yahooPrices(f as unknown as typeof fetch).closes('VAS');
    expect(out).toEqual([{ date: '2026-10-23', closeMicros: 103_100_000 }]);
  });

  it('skips zero and negative closes', async () => {
    const out = await yahooPrices(ok(payload([0, 103.1, -1])) as unknown as typeof fetch).closes('VAS');
    expect(out).toEqual([{ date: '2026-10-23', closeMicros: 103_100_000 }]);
  });

  it('throws on HTTP errors and on a bad shape', async () => {
    const bad = vi.fn(async () => new Response('x', { status: 500 }));
    await expect(yahooPrices(bad as unknown as typeof fetch).closes('VAS')).rejects.toThrow();
    await expect(yahooPrices(ok({ chart: { result: null } }) as unknown as typeof fetch).closes('VAS')).rejects.toThrow();
  });

  it('passes a timeout signal', async () => {
    const f = ok(payload([1]));
    await yahooPrices(f as unknown as typeof fetch).closes('VAS');
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks for daily closes from a start date when given one', async () => {
    const f = ok(payload([1]));
    await yahooPrices(f as unknown as typeof fetch).closes('VAS', '2019-09-18');
    const [url] = f.mock.calls[0] as unknown as [string];
    expect(url).toContain(`period1=${Date.UTC(2019, 8, 18) / 1000}`);
    expect(url).toContain('interval=1d');
    expect(url).not.toContain('range=');
  });
});
