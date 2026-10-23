import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';
import { AccountRow } from '../src/components/AccountRow';
import { BankLogo } from '../src/components/BankLogo';
import { CategoryBar } from '../src/components/CategoryBar';
import { HeroCard } from '../src/components/HeroCard';
import { MonthSwitcher } from '../src/components/MonthSwitcher';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

it('HeroCard has the signature corner', async () => {
  await render(<HeroCard testID="h" />);
  expect(screen.getByTestId('h')).toHaveStyle({
    borderBottomLeftRadius: 6,
    borderTopLeftRadius: 26,
    backgroundColor: '#ff7a45',
  });
});

it('MonthSwitcher steps months', async () => {
  const onChange = jest.fn();
  await render(<MonthSwitcher value="2026-01" onChange={onChange} />);
  expect(screen.getByText('January 2026')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Previous month'));
  expect(onChange).toHaveBeenCalledWith('2025-12');
});

describe('Screen', () => {
  it('shows the paper grain at once, without the Android image fade-in', async () => {
    const { Screen } = require('../src/components/Screen');
    const { Text } = require('react-native');
    const { renderScreen } = require('../test-utils/renderScreen');
    const view = await renderScreen(<Screen><Text>hi</Text></Screen>);
    type Node = { props: Record<string, unknown>; children?: (Node | string)[] | null };
    const images: Node[] = [];
    const walk = (n: Node | Node[] | string | null) => {
      if (!n || typeof n === 'string') return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.props.resizeMode === 'repeat') images.push(n);
      (n.children ?? []).forEach(walk);
    };
    walk(view.toJSON() as Node);
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) expect(img.props.fadeDuration).toBe(0);
  });
});

describe('AccountRow', () => {
  const account = {
    id: 9, source: 'pocketsmith', institution: 'Up', name: 'Up spend', displayName: 'Daily', kind: 'transaction', balanceCents: 5000,
    balanceDate: null, countsSpending: true, countsNetWorth: true, projections: 'off', isOffset: false, stale: false, icon: null,
  } as const;

  it('pushes the account route when pressed', async () => {
    await render(<AccountRow account={account as any} lastSuccessAt={null} />);
    await fireEvent.press(screen.getByLabelText('Daily'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/account/[id]', params: { id: '9' } });
  });

  it('is a labelled button with padding, a min height and a rounded clip', async () => {
    await render(<AccountRow account={account as any} lastSuccessAt={null} />);
    const row = screen.getByLabelText('Daily');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row).toHaveStyle({ minHeight: 64, paddingVertical: 14, borderRadius: 12, overflow: 'hidden' });
  });

  it('changes background while pressed', async () => {
    await render(<AccountRow account={account as any} lastSuccessAt={null} />);
    const idle = StyleSheet.flatten(screen.getByLabelText('Daily').props.style).backgroundColor;
    expect(idle).toBe('transparent');
    await act(async () => {
      screen.getByLabelText('Daily').props.onResponderGrant({ nativeEvent: { touches: [], changedTouches: [], timestamp: Date.now() }, persist: () => {}, currentTarget: 1, target: 1 });
      await new Promise(r => setTimeout(r, 200));
    });
    const pressed = StyleSheet.flatten(screen.getByLabelText('Daily').props.style).backgroundColor;
    expect(pressed).not.toBe(idle);
  });

  it('has a foreground android ripple', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(<AccountRow account={account as any} lastSuccessAt={null} />);
    const row = screen.getByLabelText('Daily');
    expect(row.props.nativeForegroundAndroid).toBeTruthy();
    expect(row.props.nativeBackgroundAndroid).toBeFalsy();
  });
});

describe('BankLogo', () => {
  const images = () => {
    type Node = { type: string; children?: (Node | string)[] | null };
    const found: Node[] = [];
    const walk = (n: Node | Node[] | string | null) => {
      if (!n || typeof n === 'string') return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (n.type === 'Image') found.push(n);
      (n.children ?? []).forEach(walk);
    };
    walk(screen.toJSON() as Node | Node[] | null);
    return found;
  };
  const imageCount = () => images().length;

  it.each(['CommBank (Commonwealth Bank)', 'American Express', 'Up'])('renders an image for %s', async name => {
    await render(<BankLogo institution={name} />);
    expect(imageCount()).toBe(1);
    expect((images()[0] as any).props.fadeDuration).toBe(0);
  });

  it('renders nothing for Manual', async () => {
    await render(<BankLogo institution="Manual" />);
    expect(imageCount()).toBe(0);
  });
});

it('CategoryBar draws a limit marker at its fraction', async () => {
  await render(<CategoryBar emoji="🛒" color="#c6f36b" name="Groceries" cents={5000} fraction={0.4} limitFraction={0.5} />);
  expect(screen.getByTestId('limit-marker')).toHaveStyle({ left: '50%' });
});

it('CategoryBar has no marker without a limit', async () => {
  await render(<CategoryBar emoji="🛒" color="#c6f36b" name="Groceries" cents={5000} fraction={0.4} />);
  expect(screen.queryByTestId('limit-marker')).toBeNull();
});
