import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import * as RN from 'react-native';
import { themes, resolveMode } from '../src/theme/tokens';
import { useTheme } from '../src/theme/useTheme';
import { useSettings } from '../src/settings/store';

it('dark tokens match the visual spec', () =>
  expect(themes.dark).toMatchObject({
    bg: '#241f31', surface: '#342c47', line: '#4a4163', ink: '#f4efe6', inkMuted: '#c4bdd4',
    inkFaded: '#7d7494', inkOnAccent: '#16131f', noteLime: '#c6f36b', notePink: '#ff8fb1',
  }));

it('light tokens match the visual spec', () =>
  expect(themes.light).toMatchObject({
    bg: '#f6efe3', surface: '#ffffff', surfaceSunken: '#f6efe3', surfaceEdge: '#ddd1bd', line: '#ddd1bd',
    ink: '#241f31', inkMuted: '#625a76', inkFaded: '#a69d8c', noteLime: '#4c7a0e', notePink: '#c2416b',
    strokeLime: '#5f9412', strokeYellow: '#e0a100', chartLime: '#5f9412',
  }));

it('system follows the phone', () => {
  expect(resolveMode('system', 'light')).toBe('light');
  expect(resolveMode('system', null)).toBe('dark');
});

it('explicit choice ignores the phone', () => expect(resolveMode('dark', 'light')).toBe('dark'));

function Probe() {
  return <Text>{useTheme().mode}</Text>;
}

describe('useTheme at runtime', () => {
  afterEach(() => jest.restoreAllMocks());

  it('follows a system change without restart', async () => {
    useSettings.setState({ themeMode: 'system' });
    const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    const view = await render(<Probe />);
    expect(screen.getByText('dark')).toBeTruthy();
    spy.mockReturnValue('light');
    await view.rerender(<Probe />);
    expect(screen.getByText('light')).toBeTruthy();
  });

  it('explicit dark ignores the system', async () => {
    useSettings.setState({ themeMode: 'dark' });
    jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
    await render(<Probe />);
    expect(screen.getByText('dark')).toBeTruthy();
  });
});
