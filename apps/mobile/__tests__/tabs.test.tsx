import { renderRouter } from 'expo-router/testing-library';

// The router harness swaps in its own Reanimated mock, which gesture detectors can't use. Tab swipes have their own tests.
jest.mock('../src/components/TabSwipe', () => ({ TabSwipe: ({ children }: { children: unknown }) => children }));

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
