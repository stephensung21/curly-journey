import { useColorScheme } from 'react-native';
import { useSettings } from '../settings/store';
import { resolveMode, themes, type Mode, type ThemeTokens } from './tokens';

export function useTheme(): ThemeTokens & { mode: Mode } {
  const themeMode = useSettings(s => s.themeMode);
  const system = useColorScheme();
  const mode = resolveMode(themeMode, system === 'light' || system === 'dark' ? system : null);
  return { ...themes[mode], mode };
}
