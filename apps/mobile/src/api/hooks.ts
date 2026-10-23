import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { ApiError, apiFetch } from './client';
import { clearConnection, loadConnection, saveConnection } from './connection';
import { useConnectionStore } from './connectionStore';
import type {
  Account,
  AccountSettings,
  AccountsResponse,
  CategorisationStats,
  Category,
  Connection,
  DailyPoint,
  ImportBody,
  ImportCommit,
  ImportPreview,
  InboxResponse,
  InOutMonth,
  NewCategory,
  NewRule,
  Rule,
  RulePreviewParams,
  SpendingQuery,
  SpendingSummary,
  SyncResult,
  SyncStatus,
  Transaction,
  TransactionPatch,
  TransactionQuery,
  TransactionsResponse,
} from './types';

export function useConnection() {
  const conn = useConnectionStore(s => s.conn);
  const loading = useConnectionStore(s => s.loading);
  const qc = useQueryClient();

  useEffect(() => {
    if (!useConnectionStore.getState().loading) return;
    let live = true;
    loadConnection()
      .then(c => live && useConnectionStore.setState({ conn: c, loading: false }))
      .catch(() => live && useConnectionStore.setState({ conn: null, loading: false }));
    return () => {
      live = false;
    };
  }, []);

  const set = useCallback(async (c: Connection) => {
    await saveConnection(c);
    qc.clear();
    useConnectionStore.setState({ conn: c, loading: false, authError: false });
  }, [qc]);
  const clear = useCallback(async () => {
    await clearConnection();
    qc.clear();
    useConnectionStore.setState({ conn: null, loading: false });
  }, [qc]);

  return { conn, loading, set, clear };
}

function useConn(): Connection {
  const conn = useConnectionStore(s => s.conn);
  // Queries are only enabled with a connection; the placeholder is never fetched.
  return conn ?? { url: '', token: '' };
}

export function useAccounts() {
  const conn = useConn();
  return useQuery({
    queryKey: ['accounts'],
    enabled: !!conn.url,
    queryFn: () => apiFetch<AccountsResponse>(conn, '/accounts'),
  });
}

export function useTransactions(accountId: number, month: string) {
  const conn = useConn();
  return useQuery({
    queryKey: ['transactions', accountId, month],
    enabled: !!conn.url,
    queryFn: () => apiFetch<TransactionsResponse>(conn, `/accounts/${accountId}/transactions?month=${month}`),
  });
}

export function useSyncStatus() {
  const conn = useConn();
  return useQuery({
    queryKey: ['syncStatus'],
    enabled: !!conn.url,
    queryFn: () => apiFetch<SyncStatus>(conn, '/sync/status'),
  });
}

/** Each sync call stays within the Worker's request limit, so history loads over several calls. */
const MAX_SYNC_ROUNDS = 20;

/** Resolves (does not throw) when a sync is already running. Repeats while the API reports more history to load. */
export function useSyncNow() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      let result: SyncResult = {};
      for (let round = 0; round < MAX_SYNC_ROUNDS; round++) {
        try {
          result = await apiFetch<SyncResult>(conn, '/sync', { method: 'POST' });
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) return { error: 'sync_in_progress' };
          throw e;
        }
        if (!result.more) break;
      }
      return result;
    },
    onSettled: () => qc.invalidateQueries(),
  });
}

export function useUpdateAccount() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, settings }: { id: number; settings: AccountSettings }) =>
      apiFetch<Account>(conn, `/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(settings) }),
    onMutate: async ({ id, settings }) => {
      await qc.cancelQueries({ queryKey: ['accounts'] });
      const prev = qc.getQueryData<AccountsResponse>(['accounts']);
      if (prev) {
        qc.setQueryData<AccountsResponse>(['accounts'], {
          ...prev,
          accounts: prev.accounts.map(a => (a.id === id ? { ...a, ...settings } : a)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['accounts'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
  });
}

export function useImportPreview() {
  const conn = useConn();
  return useMutation({
    mutationFn: (body: ImportBody) =>
      apiFetch<ImportPreview>(conn, '/imports/preview', { method: 'POST', body: JSON.stringify(body) }),
  });
}

export function useImportCommit() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ImportBody) =>
      apiFetch<ImportCommit>(conn, '/imports/commit', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

function qs(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Anything the owner changes can move spending totals, the inbox and the charts. */
function invalidateSpending(qc: QueryClient) {
  return Promise.all(
    ['transactions', 'transaction', 'spending', 'inbox', 'inout', 'daily'].map(k => qc.invalidateQueries({ queryKey: [k] })),
  );
}

export function useCategories() {
  const conn = useConn();
  return useQuery({
    queryKey: ['categories'],
    enabled: !!conn.url,
    queryFn: async () => (await apiFetch<{ categories: Category[] }>(conn, '/categories')).categories,
  });
}

export function useCreateCategory() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewCategory) =>
      apiFetch<Category>(conn, '/categories', { method: 'POST', body: JSON.stringify(body) }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useTransactionsQuery(q: TransactionQuery) {
  const conn = useConn();
  return useQuery({
    queryKey: ['transactions', q],
    enabled: !!conn.url,
    queryFn: () => apiFetch<TransactionsResponse>(conn, `/transactions${qs({ ...q })}`),
  });
}

export function useTransaction(id: number) {
  const conn = useConn();
  return useQuery({
    queryKey: ['transaction', id],
    enabled: !!conn.url,
    queryFn: () => apiFetch<Transaction>(conn, `/transactions/${id}`),
  });
}

type ListSnapshot = [QueryKey, TransactionsResponse | undefined][];

export function useUpdateTransaction() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TransactionPatch }) =>
      apiFetch<Transaction>(conn, `/transactions/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] });
      await qc.cancelQueries({ queryKey: ['transaction', id] });
      const apply = (t: Transaction): Transaction => ({
        ...t,
        ...patch,
        ...('categoryId' in patch ? { categorySource: 'user' as const } : {}),
        ...('flow' in patch ? { flowSource: 'user' as const } : {}),
      });
      const lists: ListSnapshot = qc
        .getQueriesData<TransactionsResponse>({ queryKey: ['transactions'] })
        .filter(([, data]) => data?.transactions.some(t => t.id === id));
      for (const [key, data] of lists) {
        qc.setQueryData<TransactionsResponse>(key, { transactions: data!.transactions.map(t => (t.id === id ? apply(t) : t)) });
      }
      const detail = qc.getQueryData<Transaction>(['transaction', id]);
      if (detail) qc.setQueryData<Transaction>(['transaction', id], apply(detail));
      return { lists, detail };
    },
    onError: (_e, { id }, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.lists) qc.setQueryData(key, data);
      if (ctx.detail) qc.setQueryData(['transaction', id], ctx.detail);
    },
    onSettled: () => invalidateSpending(qc),
  });
}

export function useSetSplits() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, splits }: { id: number; splits: Transaction['splits'] }) =>
      apiFetch<Transaction>(conn, `/transactions/${id}/splits`, { method: 'PUT', body: JSON.stringify({ splits }) }),
    onSettled: () => invalidateSpending(qc),
  });
}

export function useRules() {
  const conn = useConn();
  return useQuery({
    queryKey: ['rules'],
    enabled: !!conn.url,
    queryFn: async () => (await apiFetch<{ rules: Rule[] }>(conn, '/rules')).rules,
  });
}

export function useRulePreview(params: RulePreviewParams, enabled: boolean) {
  const conn = useConn();
  return useQuery({
    queryKey: ['rulePreview', params],
    enabled: enabled && !!conn.url,
    queryFn: () => apiFetch<{ matches: number }>(conn, `/rules/preview${qs({ ...params })}`),
  });
}

export function useCreateRule() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rule: NewRule) =>
      apiFetch<{ rule: Rule; updated: number }>(conn, '/rules', { method: 'POST', body: JSON.stringify(rule) }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['rules'] }), invalidateSpending(qc)]),
  });
}

export function useDeleteRule() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(conn, `/rules/${id}`, { method: 'DELETE' }),
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: ['rules'] }), invalidateSpending(qc)]),
  });
}

export function useSpending(q: SpendingQuery) {
  const conn = useConn();
  return useQuery({
    queryKey: ['spending', q],
    enabled: !!conn.url,
    queryFn: () => apiFetch<SpendingSummary>(conn, `/spending${qs({ ...q })}`),
  });
}

export function useInOut(end: string, months: number) {
  const conn = useConn();
  return useQuery({
    queryKey: ['inout', end, months],
    enabled: !!conn.url,
    queryFn: async () => (await apiFetch<{ months: InOutMonth[] }>(conn, `/spending/inout${qs({ end, months })}`)).months,
  });
}

export function useDaily(month: string) {
  const conn = useConn();
  return useQuery({
    queryKey: ['daily', month],
    enabled: !!conn.url,
    queryFn: async () => (await apiFetch<{ days: DailyPoint[] }>(conn, `/spending/daily${qs({ month })}`)).days,
  });
}

export function useInbox() {
  const conn = useConn();
  return useQuery({
    queryKey: ['inbox'],
    enabled: !!conn.url,
    queryFn: () => apiFetch<InboxResponse>(conn, '/inbox'),
  });
}

export function useCategorisationStats() {
  const conn = useConn();
  return useQuery({
    queryKey: ['categorisationStats'],
    enabled: !!conn.url,
    queryFn: () => apiFetch<CategorisationStats>(conn, '/stats/categorisation'),
  });
}
