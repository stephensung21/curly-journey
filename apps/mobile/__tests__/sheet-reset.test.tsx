import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import * as hooks from '../src/api/hooks';
import { CategoryPicker } from '../src/components/CategoryPicker';
import { TradeSheet } from '../src/components/TradeSheet';
import { ValueSheet } from '../src/components/ValueSheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/api/hooks');

beforeEach(() => {
  (hooks.useAddTrade as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (hooks.useCreateCategory as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
  (hooks.useReorderCategories as jest.Mock).mockReturnValue({ mutate: jest.fn() });
});

/** Opens the sheet, types, closes it without saving, then opens it again. */
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
function Wrapper({ children }: { children: ReactElement }) {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

async function reopen(sheet: (visible: boolean) => ReactElement, label: string) {
  // Rerender inside the same wrapper renderScreen uses, so the sheet stays mounted.
  const wrap = (v: boolean) => <Wrapper>{sheet(v)}</Wrapper>;
  const view = await render(wrap(true));
  await fireEvent.changeText(screen.getByLabelText(label), 'half typed');
  await view.rerender(wrap(false));
  await view.rerender(wrap(true));
  return screen.getByLabelText(label).props.value;
}

it('the trade sheet starts empty again after closing without saving', async () => {
  expect(await reopen(v => <TradeSheet visible={v} onClose={() => {}} />, 'Units')).toBe('');
});

it('the value sheet starts empty again after closing without saving', async () => {
  const sheet = (v: boolean) => <ValueSheet visible={v} onClose={() => {}} today="2026-10-26" saving={false} onSave={async () => {}} />;
  expect(await reopen(sheet, 'Value')).toBe('');
});

it('the category picker clears its search after closing', async () => {
  const sheet = (v: boolean) => <CategoryPicker visible={v} onClose={() => {}} onPick={() => {}} categories={[]} />;
  expect(await reopen(sheet, 'Search categories')).toBe('');
});
