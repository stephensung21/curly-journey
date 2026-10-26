import { render, screen } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Screen } from '../src/components/Screen';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 30, left: 0, right: 0, bottom: 0 } };

it('keeps scrolling content below the status bar instead of under it', async () => {
  await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <Screen testID="scroll">
        <Text>Hi</Text>
      </Screen>
    </SafeAreaProvider>,
  );
  const scroll = screen.getByTestId('scroll');
  // The inset sits outside the ScrollView, so content scrolling up stops at the status bar.
  expect(StyleSheet.flatten(scroll.props.style)).toMatchObject({ marginTop: 30 });
  expect(StyleSheet.flatten(scroll.props.contentContainerStyle)).toMatchObject({ paddingTop: 12 });
});
