import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';
import { renderScreen } from '../test-utils/renderScreen';
import SettingsScreen from '../app/settings';
import { useSettings } from '../src/settings/store';

const mockClear = jest.fn();
const mockPush = jest.fn();
let mockStats: { autoPercent: number | null; sample: number } | undefined;
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../src/api/hooks', () => ({
  useConnection: () => ({ conn: null, loading: false, set: jest.fn(), clear: mockClear }),
  useCategorisationStats: () => ({ data: mockStats }),
}));

beforeEach(() => {
  mockClear.mockClear();
  mockPush.mockClear();
  mockStats = { autoPercent: 92, sample: 50 };
  useSettings.setState({ themeMode: 'system', hideBalances: false, homeChart: 'sixMonths' });
});

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

it('Disconnect from API clears the connection', async () => {
  await renderScreen(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Disconnect from API'));
  expect(mockClear).toHaveBeenCalledTimes(1);
});

it('Rules row shows the auto-sorted percent and opens the rules screen', async () => {
  await renderScreen(<SettingsScreen />);
  await fireEvent.press(screen.getByText('Rules \u00b7 92% auto-sorted'));
  expect(mockPush).toHaveBeenCalledWith('/rules');
});

it('Rules row is just Rules when there is no percent', async () => {
  mockStats = { autoPercent: null, sample: 0 };
  await renderScreen(<SettingsScreen />);
  expect(screen.getByText('Rules')).toBeTruthy();
});
