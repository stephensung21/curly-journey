import { fireEvent, render, screen } from '@testing-library/react-native';
import { HeroCard } from '../src/components/HeroCard';
import { MonthSwitcher } from '../src/components/MonthSwitcher';

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
  const { accountRowStyle } = require('../src/components/AccountRow');
  const { themes } = require('../src/theme/tokens');

  it('highlights the row while it is pressed, in both modes', () => {
    for (const t of [themes.light, themes.dark]) {
      expect(accountRowStyle(false, t).backgroundColor).toBe('transparent');
      expect(accountRowStyle(true, t).backgroundColor).toBe(t.line);
    }
  });

  it('gives each row a tall touch target with room between rows', () => {
    const s = accountRowStyle(false, themes.light);
    expect(s.minHeight).toBeGreaterThanOrEqual(64);
    expect(s.paddingVertical).toBeGreaterThanOrEqual(12);
  });
});
