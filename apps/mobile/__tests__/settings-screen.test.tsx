import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import SettingsScreen from '../app/settings';
import { useSettings } from '../src/settings/store';

beforeEach(() => useSettings.setState({ themeMode: 'system', hideBalances: false, homeChart: 'sixMonths' }));

it('changes theme mode', async () => {
  await renderScreen(<SettingsScreen />);
  fireEvent.press(screen.getByText('Light'));
  expect(useSettings.getState().themeMode).toBe('light');
});

it('toggles hide balances', async () => {
  await renderScreen(<SettingsScreen />);
  fireEvent(screen.getByLabelText('Hide balances'), 'valueChange', true);
  expect(useSettings.getState().hideBalances).toBe(true);
});

it('switches the home chart', async () => {
  await renderScreen(<SettingsScreen />);
  fireEvent.press(screen.getByText('This month'));
  expect(useSettings.getState().homeChart).toBe('thisMonth');
});

it('persists across restarts', async () => {
  useSettings.getState().setHideBalances(true);
  const saved = JSON.parse((await AsyncStorage.getItem('curly-settings')) ?? '{}');
  expect(saved.state.hideBalances).toBe(true);
  await useSettings.persist.rehydrate();
  expect(useSettings.getState().hideBalances).toBe(true);
});
