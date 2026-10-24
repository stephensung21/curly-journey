/** A CoinSpot response that was not 2xx, or whose body said it failed. Carries no key material. */
export class CoinSpotError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`CoinSpot request failed with status ${status}`);
    this.name = 'CoinSpotError';
    this.status = status;
  }
}

export type CoinSpotHolding = { symbol: string; units: string; audCents: number };
export type CoinSpotClient = { balances(): Promise<CoinSpotHolding[]> };

const BALANCES_URL = 'https://www.coinspot.com.au/api/v2/ro/my/balances';

async function sign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Resp = { status?: string; balances?: Record<string, { balance: number; audbalance: number }>[] };

export function coinSpotClient(key: string, secret: string, fetchImpl: typeof fetch = fetch): CoinSpotClient {
  return {
    async balances() {
      const body = JSON.stringify({ nonce: Date.now() });
      const res = await fetchImpl(BALANCES_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', key, sign: await sign(secret, body) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new CoinSpotError(res.status);
      const json = (await res.json()) as Resp;
      if (json.status !== 'ok' || !Array.isArray(json.balances)) throw new CoinSpotError(res.status);
      const out: CoinSpotHolding[] = [];
      for (const entry of json.balances) {
        for (const [symbol, v] of Object.entries(entry)) {
          if (!(v.balance > 0)) continue;
          const aud = Number.isFinite(v.audbalance) ? v.audbalance : 0;
          out.push({ symbol, units: String(v.balance), audCents: Math.round(aud * 100) });
        }
      }
      return out;
    },
  };
}
