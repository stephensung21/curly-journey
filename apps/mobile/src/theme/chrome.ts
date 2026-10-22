import { DarkTheme, DefaultTheme } from 'expo-router';
import { accents, type Mode, type ThemeTokens } from './tokens';

/** Navigation chrome (headers, tab bar, screen backgrounds) in app colours (visual spec §8a tab bar). */
export function navTheme(t: ThemeTokens & { mode: Mode }) {
  const base = t.mode === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: t.mode === 'dark',
    colors: {
      ...base.colors,
      primary: accents.orange,
      background: t.bg,
      card: t.mode === 'dark' ? t.bg : t.surface,
      text: t.ink,
      border: t.line,
      notification: accents.orange,
    },
  };
}

export function tabBarColors(t: ThemeTokens): { active: string; inactive: string } {
  return { active: t.ink, inactive: t.inkMuted };
}

/** Status bar icons must contrast with the app's mode, which may differ from the phone's. */
export function statusBarStyle(mode: Mode): 'light' | 'dark' {
  return mode === 'dark' ? 'light' : 'dark';
}
