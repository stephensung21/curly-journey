import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

it('shows the four tabs in order', async () => {
  const view = await renderRouter('./app', { initialUrl: '/' });
  const tabs = await view.findAllByLabelText(/, tab, \d+ of \d+$/);
  const labels = tabs.map(t => String(t.props.accessibilityLabel).split(',')[0]);
  expect(labels).toEqual(['Accounts', 'Spending', 'Projections', 'More']);
}, 60_000);

it('tab bar and tab screens use the app theme', async () => {
  const { useSettings } = require('../src/settings/store');
  useSettings.setState({ themeMode: 'dark' });
  const view = await renderRouter('./app', { initialUrl: '/' });
  const flat = (s: unknown) => Object.assign({}, ...[s].flat(Infinity).filter(Boolean));
  const bar = (await view.findAllByLabelText(/, tab, 1 of 4$/))[0]!.parent;
  let node = bar;
  let found = false;
  while (node) {
    if (flat(node.props.style).backgroundColor === '#241f31') found = true;
    node = node.parent;
  }
  expect(found).toBe(true);
}, 60_000);

it('every tab has an icon', async () => {
  const view = await renderRouter('./app', { initialUrl: '/' });
  await view.findAllByLabelText(/, tab, \d+ of \d+$/);
  for (const name of ['accounts', 'spending', 'projections', 'more']) {
    expect(view.getAllByTestId(`tab-icon-${name}`).length).toBeGreaterThan(0);
  }
}, 60_000);

it('renders every tab up front so switching never shows a blank first frame', async () => {
  const view = await renderRouter('./app', { initialUrl: '/' });
  await view.findAllByLabelText(/, tab, \d+ of \d+$/);
  expect(view.getByTestId('spending-scroll', { includeHiddenElements: true })).toBeTruthy();
}, 60_000);

it('tapping a tab moves to it', async () => {
  const view = await renderRouter('./app', { initialUrl: '/' });
  const spending = (await view.findAllByLabelText(/^Spending, tab, 2 of 4$/))[0]!;
  await fireEvent.press(spending);
  expect(screen).toHavePathname('/spending');
  expect(spending.props.accessibilityState).toEqual({ selected: true });
}, 60_000);

it('a finger on a slider holds the tabs still until it lifts', async () => {
  // The real tab layout around stub screens, one of them a slider.
  const { default: TabLayout } = require('../app/(tabs)/_layout');
  const { Slider } = require('../src/components/Slider');
  const SliderScreen = () => <Slider label="X" accessibilityLabel="X" value={0} min={0} max={10} step={1} onChange={() => {}} format={() => null} />;
  const view = await renderRouter(
    { '(tabs)/_layout': TabLayout, '(tabs)/index': SliderScreen, '(tabs)/spending': () => null, '(tabs)/projections': () => null, '(tabs)/more': () => null },
    { initialUrl: '/' },
  );
  await view.findAllByLabelText(/, tab, \d+ of \d+$/);
  // The tab pager is the only element here with scrollEnabled set.
  const tabPagerScroll = () => {
    const walk = (n: unknown): boolean | undefined => {
      if (!n || typeof n !== 'object') return undefined;
      if (Array.isArray(n)) return n.map(walk).find(v => v !== undefined);
      const node = n as { props?: { scrollEnabled?: boolean }; children?: unknown };
      return node.props?.scrollEnabled ?? walk(node.children);
    };
    return walk(view.toJSON());
  };
  expect(tabPagerScroll()).toBe(true);
  const track = view.getByLabelText('X');
  await fireEvent(track, 'touchStart');
  expect(tabPagerScroll()).toBe(false);
  await fireEvent(track, 'touchEnd');
  expect(tabPagerScroll()).toBe(true);
}, 60_000);
