import { renderRouter } from 'expo-router/testing-library';

it('shows the four tabs in order', async () => {
  const view = await renderRouter('./app', { initialUrl: '/' });
  const tabs = await view.findAllByLabelText(/, tab, \d+ of \d+$/);
  const labels = tabs.map(t => String(t.props.accessibilityLabel).split(',')[0]);
  expect(labels).toEqual(['Accounts', 'Spending', 'Projections', 'More']);
});
