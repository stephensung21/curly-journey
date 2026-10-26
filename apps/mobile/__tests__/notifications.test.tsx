import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { renderScreen } from '../test-utils/renderScreen';
import NotificationsScreen from '../app/notifications';
import { apiFetch } from '../src/api/client';
import * as hooks from '../src/api/hooks';
import { registerForPush } from '../src/notifications/register';
import { useNotificationRouting } from '../src/notifications/useNotificationRouting';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('../src/api/hooks');
jest.mock('../src/api/client', () => ({ ...jest.requireActual('../src/api/client'), apiFetch: jest.fn(async () => undefined) }));

const mocked = hooks as jest.Mocked<typeof hooks>;
const N = Notifications as jest.Mocked<typeof Notifications>;
const conn = { url: 'https://api.test', token: 'cj_test' };
const prefs = { limit: true, bill: true, paid_check: true, sync: true, stale: true, trade_hint: true };
const setPrefs = jest.fn();
const test = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  setPrefs.mockResolvedValue(prefs);
  (mocked.useConnection as jest.Mock).mockReturnValue({ conn });
  (mocked.useNotificationPrefs as jest.Mock).mockReturnValue({ data: prefs });
  (mocked.useSetNotificationPrefs as jest.Mock).mockReturnValue({ mutate: setPrefs, isPending: false });
  (mocked.useRegisterDevice as jest.Mock).mockReturnValue({ mutateAsync: () => registerForPush(conn), isPending: false });
  (mocked.useTestNotification as jest.Mock).mockReturnValue({ mutateAsync: test, isPending: false });
});

it('Turn on notifications posts the push token when permission is granted', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' } as never);
  N.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  await renderScreen(<NotificationsScreen />);
  await fireEvent.press(await screen.findByText('Turn on notifications'));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(conn, '/push/devices', { method: 'POST', body: JSON.stringify({ token: 'ExponentPushToken[fake]' }) }),
  );
  expect(N.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'Default' }));
  expect(await screen.findByText('Notifications are on')).toBeTruthy();
});

it('shows the Android settings line and posts nothing when denied', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' } as never);
  N.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false, status: 'denied' } as never);
  await renderScreen(<NotificationsScreen />);
  await fireEvent.press(await screen.findByText('Turn on notifications'));
  expect(await screen.findByText('Allow notifications in Android settings')).toBeTruthy();
  expect(screen.getByText('Notifications are off')).toBeTruthy();
  expect(apiFetch).not.toHaveBeenCalled();
});

it('toggling Bills & dates puts bill:false', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  await renderScreen(<NotificationsScreen />);
  await fireEvent(await screen.findByLabelText('Bills & dates'), 'valueChange', false);
  expect(setPrefs).toHaveBeenCalledWith({ bill: false });
});

it('sends a test and shows plain errors', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  const { ApiError } = jest.requireActual('../src/api/client');
  test.mockRejectedValueOnce(new ApiError(409, 'no_devices')).mockRejectedValueOnce(new ApiError(503, 'push_unavailable'));
  await renderScreen(<NotificationsScreen />);
  await fireEvent.press(await screen.findByText('Send a test notification'));
  expect(await screen.findByText('Turn on notifications first')).toBeTruthy();
  await fireEvent.press(screen.getByText('Send a test notification'));
  expect(await screen.findByText("Push isn't set up on the server yet")).toBeTruthy();
});

describe('useNotificationRouting', () => {
  function Host({ ready = true }: { ready?: boolean }) {
    useNotificationRouting(ready);
    return null;
  }
  const respond = (url: unknown) => {
    const cb = N.addNotificationResponseReceivedListener.mock.calls.at(-1)![0];
    cb({ notification: { request: { content: { data: { url } } } } } as never);
  };

  it('pushes a local path and ignores external urls', async () => {
    await render(<Host />);
    respond('/calendar');
    expect(mockPush).toHaveBeenCalledWith('/calendar');
    mockPush.mockClear();
    respond('https://evil');
    respond('//evil');
    respond(42);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('holds the launch response until ready, then pushes it once', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValue({ notification: { request: { content: { data: { url: '/limits' } } } } } as never);
    const view = await render(<Host ready={false} />);
    await Promise.resolve();
    expect(N.getLastNotificationResponseAsync).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    await view.rerender(<Host ready />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    await view.rerender(<Host ready />);
    expect(mockPush).toHaveBeenCalledTimes(1);
    N.getLastNotificationResponseAsync.mockResolvedValue(null as never);
  });

  it('follows the response that launched the app', async () => {
    N.getLastNotificationResponseAsync.mockResolvedValueOnce({ notification: { request: { content: { data: { url: '/limits' } } } } } as never);
    await render(<Host />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/limits'));
  });
});

it('creates the Android channel before asking for permission', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' } as never);
  N.requestPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' } as never);
  await registerForPush(conn);
  const channel = N.setNotificationChannelAsync.mock.invocationCallOrder[0];
  expect(channel).toBeLessThan(N.getPermissionsAsync.mock.invocationCallOrder[0]);
  expect(channel).toBeLessThan(N.requestPermissionsAsync.mock.invocationCallOrder[0]);
});

it('shows the CommSec hint switch and toggles it', async () => {
  N.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' } as never);
  await renderScreen(<NotificationsScreen />);
  expect(await screen.findByText('When a CommSec payment has no trade')).toBeTruthy();
  await fireEvent(screen.getByLabelText('CommSec hint'), 'valueChange', false);
  expect(setPrefs).toHaveBeenCalledWith({ trade_hint: false });
});

it('switches stay off and locked until the saved settings load', async () => {
  (mocked.useNotificationPrefs as jest.Mock).mockReturnValue({ data: undefined });
  await renderScreen(<NotificationsScreen />);
  const toggle = screen.getByLabelText('Bills & dates');
  expect(toggle.props.value).toBe(false);
  expect(toggle.props.disabled).toBe(true);
});
