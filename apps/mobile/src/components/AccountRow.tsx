import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import type { Account, AccountKind } from '../api/types';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { IconTile } from './IconTile';
import { Pill } from './Pill';

export const kindEmoji: Record<AccountKind, string> = {
  transaction: '🏠', savings: '🐷', credit_card: '💳', mortgage: '🏦', brokerage: '📈', manual_asset: '🏡', crypto: '🪙',
};
export const kindColor: Record<AccountKind, string> = {
  transaction: accents.yellow, savings: accents.pink, credit_card: accents.pink,
  mortgage: accents.blue, brokerage: accents.lime, manual_asset: accents.purple, crypto: accents.orange,
};

/** Whole days since the last sync (floor, minimum 1). */
export function daysSince(iso: string | null, now = new Date()): number | null {
  if (!iso) return null;
  return Math.max(1, Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000));
}

export function AccountRow({ account, lastSuccessAt }: { account: Account; lastSuccessAt: string | null }) {
  const t = useTheme();
  const router = useRouter();
  const days = daysSince(lastSuccessAt);
  return (
    // A plain Pressable, not <Link asChild>: Link's Slot merges style with an object spread, which turns a
    // style function into {} and silently drops the padding and the pressed background.
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={account.displayName ?? account.name}
      onPress={() => router.push({ pathname: '/account/[id]', params: { id: String(account.id) } })}
      android_ripple={{ color: t.line, foreground: true }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 64,
        paddingVertical: 14,
        // The highlight reaches past the content; the negative margin keeps the content in line with the bank header.
        paddingHorizontal: 8,
        marginHorizontal: -8,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: pressed ? t.line + '80' : 'transparent',
      })}
    >
      <IconTile emoji={account.icon ?? kindEmoji[account.kind]} color={kindColor[account.kind]} />
      <View style={{ flex: 1, gap: 3 }}>
        <AppText variant="bodyStrong">{account.displayName ?? account.name}</AppText>
        {account.isOffset ? (
          <AppText variant="label" tone="muted">
            Offset · home loan
          </AppText>
        ) : null}
        {account.needsUpdate ? <Pill tone="warn">update?</Pill> : null}
        {account.stale ? <Pill tone="warn">{days === null ? 'never synced' : `synced ${days} ${days === 1 ? 'day' : 'days'} ago`}</Pill> : null}
      </View>
      <Amount cents={account.balanceCents} decimals="never" />
    </Pressable>
  );
}
