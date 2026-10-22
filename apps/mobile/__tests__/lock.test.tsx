import { act, screen } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, type AppStateStatus } from 'react-native';
import { AppText } from '../src/components/AppText';
import { LockGate } from '../src/lock/LockGate';
import { shouldLock } from '../src/lock/shouldLock';
import { renderScreen } from '../test-utils/renderScreen';

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

const auth = LocalAuthentication.authenticateAsync as jest.Mock;
const level = LocalAuthentication.getEnrolledLevelAsync as jest.Mock;

describe('shouldLock', () => {
  it('locks on cold start', () => expect(shouldLock(null, 1000)).toBe(true));
  it('stays unlocked under 5 min', () => expect(shouldLock(0, 299_999)).toBe(false));
  it('locks at exactly 5 min', () => expect(shouldLock(0, 300_000)).toBe(true));
});

describe('LockGate', () => {
  let onAppState: (s: AppStateStatus) => void = () => {};

  beforeEach(() => {
    auth.mockReset();
    level.mockReset();
    level.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, cb) => {
      onAppState = cb as (s: AppStateStatus) => void;
      return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps the lock screen when auth fails', async () => {
    auth.mockResolvedValue({ success: false, error: 'user_cancel' });
    await renderScreen(<LockGate><AppText>secret</AppText></LockGate>);
    expect(await screen.findByText('Unlock')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('shows the app after auth succeeds', async () => {
    auth.mockResolvedValue({ success: true });
    await renderScreen(<LockGate><AppText>secret</AppText></LockGate>);
    expect(await screen.findByText('secret')).toBeTruthy();
  });

  it('relocks after 5+ min in background', async () => {
    auth.mockResolvedValue({ success: true });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await renderScreen(<LockGate><AppText>secret</AppText></LockGate>);
    expect(await screen.findByText('secret')).toBeTruthy();

    auth.mockResolvedValue({ success: false, error: 'user_cancel' });
    await act(async () => onAppState('background'));
    now.mockReturnValue(1_300_000);
    await act(async () => onAppState('active'));
    expect(await screen.findByText('Unlock')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('stays unlocked after a short switch', async () => {
    auth.mockResolvedValue({ success: true });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await renderScreen(<LockGate><AppText>secret</AppText></LockGate>);
    expect(await screen.findByText('secret')).toBeTruthy();

    await act(async () => onAppState('background'));
    now.mockReturnValue(1_200_000);
    await act(async () => onAppState('active'));
    expect(screen.getByText('secret')).toBeTruthy();
    expect(auth).toHaveBeenCalledTimes(1);
  });

  it('explains when the phone has no screen lock', async () => {
    level.mockResolvedValue(LocalAuthentication.SecurityLevel.NONE);
    await renderScreen(<LockGate><AppText>secret</AppText></LockGate>);
    expect(await screen.findByText('Set up a screen lock in Android settings to use Curly Journey')).toBeTruthy();
    expect(screen.queryByText('secret')).toBeNull();
  });
});
