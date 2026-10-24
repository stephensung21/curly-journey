import { View } from 'react-native';
import { useTheme } from '../theme/useTheme';

/** 2px dashed vertical line across a 10px bar, `fraction` (0 to 1) along it. */
export function LimitMarker({ fraction }: { fraction: number }) {
  const t = useTheme();
  const left = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` as const;
  return (
    <View
      testID="limit-marker"
      pointerEvents="none"
      style={{ position: 'absolute', top: -2, height: 14, left, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: t.ink }}
    />
  );
}
