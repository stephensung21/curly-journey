import { Pressable, type PressableProps } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

export function Button({ kind = 'primary', label, disabled, onPress, ...rest }: PressableProps & { kind?: 'primary' | 'secondary'; label: string }) {
  const t = useTheme();
  const primary = kind === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => ({
        backgroundColor: primary ? accents.lime : t.surface,
        borderRadius: 999,
        paddingVertical: 12,
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
      {...rest}
    >
      <AppText variant={primary ? 'bodyStrong' : 'body'} tone={primary ? 'onAccent' : 'ink'}>
        {label}
      </AppText>
    </Pressable>
  );
}
