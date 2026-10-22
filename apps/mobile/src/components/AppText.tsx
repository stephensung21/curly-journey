import { Text, type TextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/useTheme';

export type TextVariant = 'hero' | 'title' | 'body' | 'bodyStrong' | 'label' | 'note' | 'axis';
export type TextTone = 'ink' | 'muted' | 'faded' | 'onAccent';

export const fonts = {
  medium: 'BricolageGrotesque_500Medium',
  extraBold: 'BricolageGrotesque_800ExtraBold',
  hand: 'Caveat_700Bold',
} as const;

const variants: Record<TextVariant, TextStyle> = {
  hero: { fontFamily: fonts.extraBold, fontSize: 36, letterSpacing: -0.72 },
  title: { fontFamily: fonts.extraBold, fontSize: 22 },
  body: { fontFamily: fonts.medium, fontSize: 14 },
  bodyStrong: { fontFamily: fonts.extraBold, fontSize: 14 },
  label: { fontFamily: fonts.medium, fontSize: 13 },
  note: { fontFamily: fonts.hand, fontSize: 19 },
  axis: { fontFamily: fonts.medium, fontSize: 11 },
};

export type AppTextProps = TextProps & { variant?: TextVariant; tone?: TextTone };

export function AppText({ variant = 'body', tone = 'ink', style, ...rest }: AppTextProps) {
  const t = useTheme();
  const color = { ink: t.ink, muted: t.inkMuted, faded: t.inkFaded, onAccent: t.inkOnAccent }[tone];
  return <Text style={[variants[variant], { color }, style]} {...rest} />;
}
