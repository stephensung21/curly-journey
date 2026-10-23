import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { ApiError, apiFetch } from './client';
import { clearConnection, loadConnection, saveConnection } from './connection';
import { useConnectionStore } from './connectionStore';
import type {
  Account,
  AccountSettings,
  AccountsResponse,
  Connection,
  ImportBody,
  ImportCommit,
  ImportPreview,
  SyncResult,
  SyncStatus,
  TransactionsResponse,
} from './types';

export function useConnection() {
  const conn = useConnectionStore(s => s.conn);
  const loading = useConnectionStore(s => s.loading);

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
    useConnectionStore.setState({ conn: c, loading: false, authError: false });
  }, []);
  const clear = useCallback(async () => {
    await clearConnection();
    useConnectionStore.setState({ conn: null, loading: false });
  }, []);

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

/** Resolves (does not throw) when a sync is already running. */
export function useSyncNow() {
  const conn = useConn();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      try {
        return await apiFetch<SyncResult>(conn, '/sync', { method: 'POST' });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) return { error: 'sync_in_progress' };
        throw e;
      }
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
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
