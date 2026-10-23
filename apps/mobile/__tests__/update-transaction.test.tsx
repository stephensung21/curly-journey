import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useTransactionsQuery, useUpdateTransaction } from '../src/api/hooks';
import { useConnectionStore } from '../src/api/connectionStore';

const txn = (over: object = {}) => ({
  id: 5, accountId: 7, date: '2026-10-22', amountCents: -450, description: 'Coffee', merchant: 'Cafe', status: 'posted',
  source: 'pocketsmith', categoryId: null, categorySource: null, flow: 'normal', flowSource: 'auto', note: null, memo: null,
  feedCreatedAt: null, splits: [], ...over,
});
const res = (status: number, body: unknown) => ({ status, ok: status < 300, text: async () => JSON.stringify(body) });

let qc: QueryClient;
let patchGate: { resolve: (r: unknown) => void };
const realFetch = globalThis.fetch;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const query = { month: '2026-10' };

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useConnectionStore.setState({ conn: { url: 'http://x', token: 't' }, loading: false });
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn((_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return new Promise(r => (patchGate = { resolve: r }));
    return Promise.resolve(res(200, { transactions: [txn()] }));
  });
});
afterEach(() => {
  qc.clear();
  (globalThis as unknown as { fetch: unknown }).fetch = realFetch;
});

const cached = () => qc.getQueryData<{ transactions: { categoryId: number | null; categorySource: string | null }[] }>(['transactions', query])!.transactions[0];

it('sets the category optimistically as a user edit', async () => {
  const { result } = await renderHook(() => ({ q: useTransactionsQuery(query), m: useUpdateTransaction() }), { wrapper });
  await waitFor(() => expect(result.current.q.data).toBeTruthy());
  await act(async () => { result.current.m.mutate({ id: 5, patch: { categoryId: 3 } }); });
  await waitFor(() => expect(cached()).toMatchObject({ categoryId: 3, categorySource: 'user' }));
});

it('rolls back when the update fails', async () => {
  const { result } = await renderHook(() => ({ q: useTransactionsQuery(query), m: useUpdateTransaction() }), { wrapper });
  await waitFor(() => expect(result.current.q.data).toBeTruthy());
  // Hold refetches so only the rollback can explain the cached value.
  (globalThis.fetch as jest.Mock).mockImplementation((_u: string, init?: RequestInit) =>
    init?.method === 'PATCH' ? new Promise(r => (patchGate = { resolve: r })) : new Promise(() => {}),
  );
  await act(async () => { result.current.m.mutate({ id: 5, patch: { categoryId: 3 } }); });
  await waitFor(() => expect(cached().categoryId).toBe(3));
  await act(async () => patchGate.resolve(res(500, { error: 'boom' })));
  await waitFor(() => expect(cached().categoryId).toBeNull());
});
