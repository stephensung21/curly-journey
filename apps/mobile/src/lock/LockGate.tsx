import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { SunDoodle } from '../components/doodles/SunDoodle';
import { Screen } from '../components/Screen';
import { useTheme } from '../theme/useTheme';
import { shouldLock } from './shouldLock';

type LockState = 'locked' | 'unlocked' | 'noScreenLock';

/**
 * Children mount only after the first unlock. A later relock covers them with an
 * opaque overlay instead of unmounting, so the user returns to the same screen.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const t = useTheme();
  const [state, setState] = useState<LockState>('locked');
  const [hasUnlocked, setHasUnlocked] = useState(false);
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    try {
      const level = await LocalAuthentication.getEnrolledLevelAsync();
      if (level === LocalAuthentication.SecurityLevel.NONE) {
        setState('noScreenLock');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Curly Journey',
        disableDeviceFallback: false,
      });
      if (result.success) {
        setHasUnlocked(true);
        setState('unlocked');
      } else {
        setState('locked');
      }
    } catch {
      setState('locked');
    }
  }, []);

  useEffect(() => {
    unlock();
  }, [unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background') {
        backgroundedAt.current = Date.now();
        setCovered(true);
      } else if (next === 'active') {
        setCovered(false);
        if (backgroundedAt.current === null) return;
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

  const locked = state !== 'unlocked';

  return (
    <View style={{ flex: 1 }}>
      {hasUnlocked && (
        <View style={{ flex: 1 }} importantForAccessibility={locked || covered ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
      )}
      {locked && (
        <View style={StyleSheet.absoluteFill}>
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
        </View>
      )}
      {!locked && covered && (
        <View testID="privacy-cover" style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }]}>
          <SunDoodle size={64} />
        </View>
      )}
    </View>
  );
}
