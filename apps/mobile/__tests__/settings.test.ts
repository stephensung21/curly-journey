import { useSettings } from '../src/settings/store';

it('settings defaults and setters', () => {
  expect(useSettings.getState()).toMatchObject({ themeMode: 'system', hideBalances: false, homeChart: 'sixMonths' });
  useSettings.getState().setHideBalances(true);
  expect(useSettings.getState().hideBalances).toBe(true);
  useSettings.getState().setThemeMode('light');
  expect(useSettings.getState().themeMode).toBe('light');
  useSettings.getState().setHomeChart('thisMonth');
  expect(useSettings.getState().homeChart).toBe('thisMonth');
});
