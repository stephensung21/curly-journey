import { Pressable, View } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: 999, padding: 3 }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: on ? accents.orange : 'transparent' }}
          >
            <AppText variant={on ? 'bodyStrong' : 'body'} tone={on ? 'onAccent' : 'muted'} style={{ fontSize: 13 }}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
