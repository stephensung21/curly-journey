import { formatAud, formatAudShort, type Cents } from '@curly/core';
import { Text } from 'react-native';
import { useSettings } from '../settings/store';
import { AppText, type AppTextProps } from './AppText';

type AmountProps = Omit<AppTextProps, 'children'> & {
  cents: Cents;
  decimals?: 'always' | 'never';
  signed?: boolean;
  short?: boolean;
  /** Inside other text (e.g. a HandNote): inherit the parent's font and colour. */
  inline?: boolean;
};

/** The only way to render money: respects Hide balances everywhere. */
export function Amount({ cents, decimals, signed, short, inline, variant = 'bodyStrong', ...rest }: AmountProps) {
  const hidden = useSettings(s => s.hideBalances);
  const text = short ? formatAudShort(cents, { hidden }) : formatAud(cents, { hidden, decimals, signed });
  if (inline) return <Text>{text}</Text>;
  return (
    <AppText variant={variant} {...rest}>
      {text}
    </AppText>
  );
}
