import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { useConnectionStore } from '../src/api/connectionStore';

const fetchMock = jest.fn();
const ok = (body: unknown = {}) => ({ status: 200, ok: true, text: async () => JSON.stringify(body) });

const g = globalThis as unknown as { __cjConn: unknown; __cjSaved: unknown[] };
const stub = { url: 'https://api.test', token: 'cj_test' };

// expo-router's renderer loads the app in its own module registry, so shared state lives on globalThis.
beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  g.__cjConn = null;
  g.__cjSaved = [];
  useConnectionStore.setState({ conn: null, loading: true, authError: false });
});
afterEach(() => {
  g.__cjConn = stub;
});

it('redirects to Connect when there is no connection', async () => {
  await renderRouter('./app', { initialUrl: '/' });
  expect(await screen.findByLabelText('API URL', {}, { timeout: 5000 })).toBeTruthy();
}, 60_000);

it('rejects an http:// URL with a plain error', async () => {
  await renderRouter('./app', { initialUrl: '/connect' });
  await fireEvent.changeText(await screen.findByLabelText('API URL', {}, { timeout: 10_000 }), 'http://api.test');
  await fireEvent.changeText(screen.getByLabelText('Token'), 'cj_abc');
  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Use the https:// address of your API', {}, { timeout: 10_000 })).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(g.__cjSaved).toEqual([]);
}, 60_000);

it('rejects a token without the cj_ prefix', async () => {
  await renderRouter('./app', { initialUrl: '/connect' });
  await fireEvent.changeText(await screen.findByLabelText('API URL', {}, { timeout: 10_000 }), 'https://api.test');
  await fireEvent.changeText(screen.getByLabelText('Token'), 'abc');
  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Tokens start with cj_', {}, { timeout: 10_000 })).toBeTruthy();
}, 60_000);

it('saves trimmed values after /health and /accounts succeed', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.endsWith('/accounts') ? ok({ accounts: [], lastSuccessAt: null }) : ok(),
  );
  await renderRouter('./app', { initialUrl: '/connect' });
  await fireEvent.changeText(await screen.findByLabelText('API URL', {}, { timeout: 10_000 }), '  https://api.test  ');
  await fireEvent.changeText(screen.getByLabelText('Token'), ' cj_abc ');
  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(g.__cjSaved).toEqual([{ url: 'https://api.test', token: 'cj_abc' }]), { timeout: 10_000 });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.test/health');
  expect(fetchMock.mock.calls[1][0]).toBe('https://api.test/accounts');
}, 60_000);

it('does not save when /accounts rejects the token', async () => {
  fetchMock.mockImplementation(async (url: string) => (url.endsWith('/accounts') ? { status: 401, ok: false, text: async () => '' } : ok()));
  await renderRouter('./app', { initialUrl: '/connect' });
  await fireEvent.changeText(await screen.findByLabelText('API URL', {}, { timeout: 10_000 }), 'https://api.test');
  await fireEvent.changeText(screen.getByLabelText('Token'), 'cj_abc');
  await act(async () => {
    await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));
  });
  await waitFor(() => expect(screen.getByText(/Couldn't connect|didn't work/)).toBeTruthy(), { timeout: 10_000 });
  expect(g.__cjSaved).toEqual([]);
}, 60_000);
