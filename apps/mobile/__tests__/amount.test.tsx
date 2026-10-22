import { render, screen } from '@testing-library/react-native';
import { Amount } from '../src/components/Amount';
import { AppText } from '../src/components/AppText';
import { useSettings } from '../src/settings/store';

beforeEach(() => useSettings.setState({ hideBalances: false }));

it('renders formatted cents', async () => {
  await render(<Amount cents={-231000} decimals="never" />);
  expect(screen.getByText('−$2,310')).toBeTruthy();
});

it('masks when hide balances is on', async () => {
  useSettings.setState({ hideBalances: true });
  await render(<><Amount cents={8420} /><AppText>92%</AppText></>);
  expect(screen.getByText('$•••')).toBeTruthy();
  expect(screen.getByText('92%')).toBeTruthy();
});

it('short form', async () => {
  await render(<Amount cents={40000000} short />);
  expect(screen.getByText('$400k')).toBeTruthy();
});
