import { screen } from '@testing-library/react-native';
import DesignSystemScreen from '../app/design-system';
import { useSettings } from '../src/settings/store';
import { renderScreen } from '../test-utils/renderScreen';

it('hide balances masks every amount on the gallery, including handwritten notes', async () => {
  useSettings.setState({ hideBalances: true });
  await renderScreen(<DesignSystemScreen />);
  expect(screen.queryAllByText(/\$\d/)).toHaveLength(0);
  expect(screen.getByText('up $••• since Sept')).toBeTruthy();
  expect(screen.getByText('92%', { exact: false })).toBeTruthy();
});
