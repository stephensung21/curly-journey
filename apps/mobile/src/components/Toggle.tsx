import { Switch, type SwitchProps } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export function Toggle({ value, onChange, ...rest }: Omit<SwitchProps, 'onValueChange' | 'onChange'> & { onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: accents.lime, false: t.line }}
      thumbColor={value ? t.inkOnAccent : t.inkMuted}
      {...rest}
    />
  );
}
