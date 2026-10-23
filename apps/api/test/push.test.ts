import { describe, expect, it } from 'vitest';
import { expoPush } from '../src/push/expo';

const msgs = [
  { title: 'A', body: 'a', url: '/a' },
  { title: 'B', body: 'b', url: '/b' },
];

function fakeFetch(status: number, data: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data }), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

describe('expoPush', () => {
  it('posts one entry per token x message', async () => {
    const f = fakeFetch(200, [{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }, { status: 'ok' }]);
    await expoPush(undefined, f.impl).send(['ExponentPushToken[t1]', 'ExponentPushToken[t2]'], msgs);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    const body = JSON.parse(f.calls[0]!.init.body as string);
    expect(body).toHaveLength(4);
    expect(body[0]).toEqual({ to: 'ExponentPushToken[t1]', title: 'A', body: 'a', data: { url: '/a' }, sound: 'default', channelId: 'default' });
  });

  it('sends Authorization only with an access token', async () => {
    const a = fakeFetch(200, []);
    await expoPush(undefined, a.impl).send(['ExponentPushToken[t1]'], msgs);
    expect((a.calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    const b = fakeFetch(200, []);
    await expoPush('fake-access', b.impl).send(['ExponentPushToken[t1]'], msgs);
    expect((b.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer fake-access');
  });

  it('reports DeviceNotRegistered tokens', async () => {
    const f = fakeFetch(200, [
      { status: 'ok' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    const r = await expoPush(undefined, f.impl).send(['ExponentPushToken[t1]', 'ExponentPushToken[t2]'], [msgs[0]!]);
    expect(r.invalidTokens).toEqual(['ExponentPushToken[t2]']);
  });

  it('throws on a 500', async () => {
    const f = fakeFetch(500, null);
    await expect(expoPush(undefined, f.impl).send(['ExponentPushToken[t1]'], msgs)).rejects.toThrow();
  });
});
