import { useTheme } from '../../theme/useTheme';
import { AppText, type AppTextProps } from '../AppText';

/** Handwritten note. Never use for warnings or amounts you must act on. */
export function HandNote({ tone = 'lime', style, ...rest }: Omit<AppTextProps, 'tone'> & { tone?: 'lime' | 'pink' }) {
  const t = useTheme();
  return <AppText variant="note" style={[{ color: tone === 'lime' ? t.noteLime : t.notePink }, style]} {...rest} />;
}
