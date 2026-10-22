import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/useTheme';

export function Card({ style, ...rest }: ViewProps) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.surface, borderRadius: 18, padding: 12, borderBottomWidth: 1, borderBottomColor: t.surfaceEdge },
        style,
      ]}
      {...rest}
    />
  );
}
