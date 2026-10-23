import { View } from 'react-native';
import type { Transaction } from '../api/types';
import { useTheme } from '../theme/useTheme';
import { Amount } from './Amount';
import { AppText } from './AppText';

/** One transaction: description (+ Pending subline) and amount. Money in is lime and signed. */
export function TransactionRow({ txn }: { txn: Transaction }) {
  const t = useTheme();
  const income = txn.amountCents > 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {txn.description}
        </AppText>
        {txn.status === 'pending' ? (
          <AppText variant="label" tone="muted">
            Pending
          </AppText>
        ) : null}
      </View>
      {income ? (
        <Amount cents={txn.amountCents} signed style={{ color: t.noteLime }} />
      ) : (
        <Amount cents={txn.amountCents} />
      )}
    </View>
  );
}
