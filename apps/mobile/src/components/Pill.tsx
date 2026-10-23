import { View } from 'react-native';
import { accents } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { AppText } from './AppText';

type Tone = 'ok' | 'warn' | 'neutral' | 'chip' | 'alert';

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: string }) {
  const t = useTheme();
  const bg = { ok: accents.lime, warn: accents.yellow, neutral: t.line, chip: t.inkOnAccent, alert: accents.pink }[tone];
  const fg = { ok: t.inkOnAccent, warn: t.inkOnAccent, neutral: t.inkMuted, chip: accents.lime, alert: t.inkOnAccent }[tone];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <AppText variant={tone === 'chip' ? 'label' : 'bodyStrong'} style={{ color: fg, fontSize: 12 }}>
        {children}
      </AppText>
    </View>
  );
}
