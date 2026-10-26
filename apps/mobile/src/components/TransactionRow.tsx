import { Pressable, View } from 'react-native';
import type { Category, Transaction } from '../api/types';
import { categoryColor } from '../theme/categoryColor';
import { useTheme } from '../theme/useTheme';
import { Amount } from './Amount';
import { AppText } from './AppText';
import { BankLogo, hasBankLogo } from './BankLogo';
import { IconTile } from './IconTile';

/** What a row shows besides the amount: the tile, the subline, and whether it is dimmed or needs sorting. */
function describe(txn: Transaction, category: Category | undefined) {
  const catName = category?.name ?? 'No category';
  if (txn.flow === 'transfer') return { emoji: '↔', text: 'Transfer · not spending', dim: true, todo: false, plain: true };
  if (txn.flow === 'mortgage') return { emoji: category?.emoji ?? '🏠', text: 'Mortgage · not spending', dim: false, todo: false, plain: !category };
  if (txn.flow === 'not_spending') {
    return { emoji: category?.emoji ?? '?', text: `${catName} · not spending`, dim: false, todo: false, plain: !category };
  }
  if (txn.splits.length > 1) return { emoji: '✂️', text: `Split · ${txn.splits.length} categories`, dim: false, todo: false, plain: true };
  if (txn.categoryId === null) return { emoji: '?', text: 'Uncategorised · tap to sort', dim: false, todo: true, plain: true };
  return { emoji: category?.emoji ?? '?', text: category?.name ?? '', dim: false, todo: false, plain: !category };
}

/**
 * One transaction: merchant, a category subline and the amount. Money in is lime and signed, money out is red.
 * With an `institution`, a small bank logo sits on the corner of the tile.
 */
export function TransactionRow({
  txn,
  category,
  onPress,
  institution,
}: {
  txn: Transaction;
  category: Category | undefined;
  onPress?: () => void;
  institution?: string;
}) {
  const t = useTheme();
  const d = describe(txn, category);
  const subline = txn.status === 'pending' ? (d.text ? `${d.text} · Pending` : 'Pending') : d.text;
  const amountColor = txn.amountCents > 0 ? t.noteLime : txn.amountCents < 0 ? t.negative : undefined;
  const name = txn.merchant || txn.description;
  const tile = d.plain || !category ? t.line : categoryColor(category.color, t);

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, opacity: d.dim ? 0.6 : 1 }}>
      <View>
        <IconTile emoji={d.emoji} color={tile} />
        {institution && hasBankLogo(institution) ? (
          <View testID="bank-badge" style={{ position: 'absolute', right: -4, bottom: -4, borderRadius: 5, borderWidth: 1.5, borderColor: t.surface }}>
            <BankLogo institution={institution} size={13} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        {subline ? (
          <AppText variant="label" tone="muted" style={d.todo ? { color: t.strokeYellow } : undefined}>
            {subline}
          </AppText>
        ) : null}
      </View>
      <Amount cents={txn.amountCents} signed={txn.amountCents > 0} style={amountColor ? { color: amountColor } : undefined} />
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  );
}
