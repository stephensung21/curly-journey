import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useAccounts, useUpdateAccount } from '../src/api/hooks';
import { useConnectionStore } from '../src/api/connectionStore';

const acct = (over: object = {}) => ({
  id: 7, source: 'pocketsmith', institution: 'CommBank', name: 'Everyday', displayName: null, kind: 'transaction',
  balanceCents: 1, balanceDate: null, countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false, ...over,
});
const res = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) });

let qc: QueryClient;
let patchGate: { resolve: (r: unknown) => void };
let accountsGets: number;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useConnectionStore.setState({ conn: { url: 'http://x', token: 't' }, loading: false });
  accountsGets = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return new Promise(r => (patchGate = { resolve: r }));
    accountsGets++;
    return Promise.resolve(res(200, { accounts: [acct()], lastSuccessAt: null }));
  });
});
afterEach(() => qc.clear());

const cached = () => qc.getQueryData<{ accounts: { isOffset: boolean }[] }>(['accounts'])!.accounts[0].isOffset;

it('applies the change optimistically, then refetches on success', async () => {
  const { result } = await renderHook(() => ({ q: useAccounts(), m: useUpdateAccount() }), { wrapper });
  await waitFor(() => expect(result.current.q.data).toBeTruthy());
  const before = accountsGets;
  await act(async () => { result.current.m.mutate({ id: 7, settings: { isOffset: true } }); });
  await waitFor(() => expect(cached()).toBe(true));
  await act(async () => patchGate.resolve(res(200, acct({ isOffset: true }))));
  await waitFor(() => expect(accountsGets).toBeGreaterThan(before));
});

it('rolls back on failure and refetches', async () => {
  const { result } = await renderHook(() => ({ q: useAccounts(), m: useUpdateAccount() }), { wrapper });
  await waitFor(() => expect(result.current.q.data).toBeTruthy());
  const before = accountsGets;
  await act(async () => { result.current.m.mutate({ id: 7, settings: { isOffset: true } }); });
  await waitFor(() => expect(cached()).toBe(true));
  await act(async () => patchGate.resolve(res(500, { error: 'boom' })));
  await waitFor(() => expect(result.current.m.isError).toBe(true));
  expect(cached()).toBe(false);
  await waitFor(() => expect(accountsGets).toBeGreaterThan(before));
});
