import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSettings } from '../src/settings/store';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useAddTrade, useCommsec, useCommsecImport, useDeleteTrade, useDismissHint, useNetWorth } from '../src/api/hooks';
import { useConnectionStore } from '../src/api/connectionStore';

const res = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) });

let qc: QueryClient;
const realFetch = globalThis.fetch;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  // gcTime Infinity: no garbage-collection timers left to hold Jest open after the run.
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  useConnectionStore.setState({ conn: { url: 'http://x', token: 't' }, loading: false });
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(() => Promise.resolve(res(200, { imported: 2, trade: {} })));
});
afterEach(() => {
  qc.clear();
  (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
});

const expectInvalidated = (spy: jest.SpyInstance) => {
  for (const k of ['commsec', 'networth', 'accounts']) expect(spy).toHaveBeenCalledWith({ queryKey: [k] });
};

it('import invalidates commsec, networth and accounts', async () => {
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => useCommsecImport(), { wrapper });
  await act(async () => { await result.current.mutateAsync('csv'); });
  expectInvalidated(spy);
});

it('add trade posts the body and invalidates', async () => {
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => useAddTrade(), { wrapper });
  const body = { date: '2026-10-20', side: 'buy' as const, symbol: 'VAS', units: 10, price: '100.5', brokerage: '9.5' };
  await act(async () => { await result.current.mutateAsync(body); });
  const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
  expect(url).toBe('http://x/holdings/trades');
  expect(init.method).toBe('POST');
  expect(JSON.parse(init.body)).toEqual(body);
  expectInvalidated(spy);
});

it('delete trade and dismiss hint hit the right routes', async () => {
  (globalThis.fetch as jest.Mock).mockImplementation(() => Promise.resolve(res(204, null)));
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => ({ d: useDeleteTrade(), h: useDismissHint() }), { wrapper });
  await act(async () => { await result.current.d.mutateAsync(4); });
  await act(async () => { await result.current.h.mutateAsync(9); });
  const calls = (globalThis.fetch as jest.Mock).mock.calls;
  expect([calls[0][0], calls[0][1].method]).toEqual(['http://x/holdings/trades/4', 'DELETE']);
  expect([calls[1][0], calls[1][1].method]).toEqual(['http://x/holdings/hints/9/dismiss', 'POST']);
  expectInvalidated(spy);
});

it('useNetWorth requests the range, leaving the home loan out unless the setting is on', async () => {
  const { result } = await renderHook(() => useNetWorth('1Y'), { wrapper });
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe('http://x/networth?range=1Y&loans=0');
  useSettings.setState({ netWorthIncludesLoans: true });
  const again = await renderHook(() => useNetWorth('6M'), { wrapper });
  await waitFor(() => expect(again.result.current.data).toBeTruthy());
  expect((globalThis.fetch as jest.Mock).mock.calls.at(-1)[0]).toBe('http://x/networth?range=6M&loans=1');
  useSettings.setState({ netWorthIncludesLoans: false });
});

it('useCommsec uses the commsec key and /holdings', async () => {
  const { result } = await renderHook(() => useCommsec(), { wrapper });
  await waitFor(() => expect(result.current.data).toBeTruthy());
  expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toBe('http://x/holdings');
  expect(qc.getQueryData(['commsec'])).toBeTruthy();
});
