import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { useAccounts } from '../src/api/hooks';

it('a 401 from a query sends the user to Connect with a plain message', async () => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ status: 401, ok: false, text: async () => '' }));
  await renderRouter(
    {
      _layout: require('../app/_layout').default,
      connect: require('../app/connect').default,
      '(tabs)/index': function Home() {
        useAccounts();
        return <Text>Home</Text>;
      },
    },
    { initialUrl: '/' },
  );
  expect(await screen.findByText("That token didn't work. Paste a new one.", {}, { timeout: 10_000 })).toBeTruthy();
  expect(screen.getByLabelText('API URL')).toBeTruthy();
}, 60_000);
