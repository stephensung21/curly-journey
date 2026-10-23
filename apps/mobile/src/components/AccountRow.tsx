import { View } from 'react-native';
import { accents } from '../theme/tokens';
import type { Account, AccountKind } from '../api/types';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { IconTile } from './IconTile';
import { Pill } from './Pill';

const emoji: Record<AccountKind, string> = {
  transaction: '🏠', savings: '🐷', credit_card: '💳', mortgage: '🏦', brokerage: '📈', manual_asset: '🏡',
};
const color: Record<AccountKind, string> = {
  transaction: accents.yellow, savings: accents.pink, credit_card: accents.pink,
  mortgage: accents.blue, brokerage: accents.lime, manual_asset: accents.purple,
};

/** Whole days since the last sync (floor, minimum 1). */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
}

export function AccountRow({ account, lastSuccessAt }: { account: Account; lastSuccessAt: string | null }) {
  const days = daysSince(lastSuccessAt);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <IconTile emoji={emoji[account.kind]} color={color[account.kind]} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyStrong">{account.displayName ?? account.name}</AppText>
        {account.isOffset ? (
          <AppText variant="label" tone="muted">
            Offset · home loan
          </AppText>
        ) : null}
        {account.stale ? <Pill tone="warn">{days === null ? 'never synced' : `synced ${days} days ago`}</Pill> : null}
      </View>
      <Amount cents={account.balanceCents} decimals="never" />
    </View>
  );
}
