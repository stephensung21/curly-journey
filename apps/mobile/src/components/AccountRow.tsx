import { Link } from 'expo-router';
import { Pressable, View, type ViewStyle } from 'react-native';
import { accents, type ThemeTokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { Account, AccountKind } from '../api/types';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { IconTile } from './IconTile';
import { Pill } from './Pill';

export const kindEmoji: Record<AccountKind, string> = {
  transaction: '🏠', savings: '🐷', credit_card: '💳', mortgage: '🏦', brokerage: '📈', manual_asset: '🏡',
};
export const kindColor: Record<AccountKind, string> = {
  transaction: accents.yellow, savings: accents.pink, credit_card: accents.pink,
  mortgage: accents.blue, brokerage: accents.lime, manual_asset: accents.purple,
};

/** Whole days since the last sync (floor, minimum 1). */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
}

/** Tall row that bleeds a little past the card padding, so the press highlight reads as a rounded band. */
export function accountRowStyle(pressed: boolean, t: ThemeTokens): ViewStyle {
  return {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginHorizontal: -10,
    borderRadius: 14,
    backgroundColor: pressed ? t.line : 'transparent',
  };
}

export function AccountRow({ account, lastSuccessAt }: { account: Account; lastSuccessAt: string | null }) {
  const t = useTheme();
  const days = daysSince(lastSuccessAt);
  return (
    <Link href={{ pathname: '/account/[id]', params: { id: String(account.id) } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => accountRowStyle(pressed, t)}>
        <IconTile emoji={account.icon ?? kindEmoji[account.kind]} color={kindColor[account.kind]} />
        <View style={{ flex: 1, gap: 3 }}>
          <AppText variant="bodyStrong">{account.displayName ?? account.name}</AppText>
          {account.isOffset ? (
            <AppText variant="label" tone="muted">
              Offset · home loan
            </AppText>
          ) : null}
          {account.stale ? <Pill tone="warn">{days === null ? 'never synced' : `synced ${days} ${days === 1 ? 'day' : 'days'} ago`}</Pill> : null}
        </View>
        <Amount cents={account.balanceCents} decimals="never" />
      </Pressable>
    </Link>
  );
}
