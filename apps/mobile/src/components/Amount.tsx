import { formatAud, formatAudShort, type Cents } from '@curly/core';
import { useSettings } from '../settings/store';
import { AppText, type AppTextProps } from './AppText';

type AmountProps = Omit<AppTextProps, 'children'> & {
  cents: Cents;
  decimals?: 'always' | 'never';
  signed?: boolean;
  short?: boolean;
};

/** The only way to render money: respects Hide balances everywhere. */
export function Amount({ cents, decimals, signed, short, variant = 'bodyStrong', ...rest }: AmountProps) {
  const hidden = useSettings(s => s.hideBalances);
  const text = short ? formatAudShort(cents, { hidden }) : formatAud(cents, { hidden, decimals, signed });
  return (
    <AppText variant={variant} {...rest}>
      {text}
    </AppText>
  );
}
