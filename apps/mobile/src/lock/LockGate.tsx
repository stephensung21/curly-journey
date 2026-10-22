import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { SunDoodle } from '../components/doodles/SunDoodle';
import { Screen } from '../components/Screen';
import { shouldLock } from './shouldLock';

type LockState = 'locked' | 'unlocked' | 'noScreenLock';

export function LockGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LockState>('locked');
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) {
      setState('noScreenLock');
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Curly Journey',
      disableDeviceFallback: false,
    });
    setState(result.success ? 'unlocked' : 'locked');
  }, []);

  useEffect(() => {
    unlock();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active' && backgroundedAt.current !== null) {
        const lock = shouldLock(backgroundedAt.current, Date.now());
        backgroundedAt.current = null;
        if (lock) {
          setState('locked');
          unlock();
        }
      }
    });
    return () => sub.remove();
  }, [unlock]);

  if (state === 'unlocked') return <>{children}</>;

  return (
    <Screen style={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <SunDoodle size={64} />
      <AppText variant="title">Curly Journey</AppText>
      {state === 'noScreenLock' ? (
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          Set up a screen lock in Android settings to use Curly Journey
        </AppText>
      ) : (
        <View style={{ alignSelf: 'stretch' }}>
          <Button label="Unlock" onPress={unlock} />
        </View>
      )}
    </Screen>
  );
}
