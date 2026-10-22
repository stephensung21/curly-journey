import { renderRouter } from 'expo-router/testing-library';

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
