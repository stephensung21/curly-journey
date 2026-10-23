import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useAccounts, useSyncNow, useSyncStatus } from '../../src/api/hooks';
import type { Account } from '../../src/api/types';
import { AccountRow } from '../../src/components/AccountRow';
import { AppText } from '../../src/components/AppText';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { SyncBanner } from '../../src/components/SyncBanner';

const ORDER = ['CommBank', 'Amex', 'Up', 'CommSec'];

function groupAccounts(accounts: Account[]): [string, Account[]][] {
  const map = new Map<string, Account[]>();
  for (const a of accounts) map.set(a.institution, [...(map.get(a.institution) ?? []), a]);
  const rank = (n: string) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length);
  return [...map.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

function sydneyWeekday(iso: string | null): string {
  if (!iso) return 'a while';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Australia/Sydney' });
}

export default function AccountsScreen() {
  const accountsQ = useAccounts();
  const statusQ = useSyncStatus();
  const sync = useSyncNow();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(false);
    try {
      await sync.mutateAsync();
    } catch {
      setError(true);
    }
    try {
      await Promise.all([accountsQ.refetch(), statusQ.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [sync, accountsQ, statusQ]);

  const accounts = accountsQ.data?.accounts ?? [];
  const lastSuccessAt = statusQ.data?.lastSuccessAt ?? accountsQ.data?.lastSuccessAt ?? null;
  const firstStale = accounts.find(a => a.stale && a.countsSpending);
  const bannerText =
    statusQ.data?.lastStatus === 'failed'
      ? 'Sync failed ·'
      : firstStale
        ? `${firstStale.institution} hasn't updated since ${sydneyWeekday(lastSuccessAt)}`
        : null;

  return (
    <Screen testID="accounts-scroll" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <AppText variant="title">Accounts</AppText>
      {bannerText ? <SyncBanner text={bannerText} /> : null}
      {error ? <AppText tone="muted">Sync failed. Try again soon.</AppText> : null}
      {accounts.length === 0 && !accountsQ.isLoading ? (
        <AppText tone="muted">No accounts yet. Connect PocketSmith in the backend, then pull to refresh.</AppText>
      ) : null}
      {groupAccounts(accounts).map(([institution, rows]) => (
        <Card key={institution}>
          <AppText variant="label" tone="muted">
            {institution}
          </AppText>
          {rows.map(a => (
            <AccountRow key={a.id} account={a} lastSuccessAt={lastSuccessAt} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
