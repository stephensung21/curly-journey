import { navTheme, statusBarStyle, tabBarColors } from '../src/theme/chrome';
import { themes } from '../src/theme/tokens';

it('dark nav theme uses the plum background for screens and the tab bar', () => {
  const nav = navTheme({ ...themes.dark, mode: 'dark' });
  expect(nav.dark).toBe(true);
  expect(nav.colors).toMatchObject({ background: '#241f31', card: '#241f31', text: '#f4efe6', border: '#4a4163', primary: '#ff7a45' });
});

it('light nav theme puts the tab bar on surface', () => {
  const nav = navTheme({ ...themes.light, mode: 'light' });
  expect(nav.dark).toBe(false);
  expect(nav.colors).toMatchObject({ background: '#f6efe3', card: '#ffffff', text: '#241f31', border: '#ddd1bd' });
});

it('tab tints are ink and muted ink', () =>
  expect(tabBarColors(themes.dark)).toEqual({ active: '#f4efe6', inactive: '#c4bdd4' }));

it('status bar icons contrast with the app mode, not the phone', () => {
  expect(statusBarStyle('light')).toBe('dark');
  expect(statusBarStyle('dark')).toBe('light');
});
