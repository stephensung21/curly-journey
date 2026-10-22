import { View, type ViewProps } from 'react-native';
import { accents } from '../theme/tokens';

/** The signature card: orange, with one sharp bottom-left corner. */
export function HeroCard({ style, ...rest }: ViewProps) {
  return (
    <View
      style={[
        {
          backgroundColor: accents.orange,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          borderBottomRightRadius: 26,
          borderBottomLeftRadius: 6,
          padding: 14,
        },
        style,
      ]}
      {...rest}
    />
  );
}
