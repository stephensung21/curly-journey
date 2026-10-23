import { BricolageGrotesque_500Medium, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Caveat_700Bold } from '@expo-google-fonts/caveat';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useConnection } from '../src/api/hooks';
import { QueryProvider } from '../src/api/QueryProvider';
import { LockGate } from '../src/lock/LockGate';
import { navTheme, statusBarStyle } from '../src/theme/chrome';
import { useTheme } from '../src/theme/useTheme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function AppStack() {
  const { conn, loading } = useConnection();
  if (loading) return null;
  return (
    <>
      <Stack>
        <Stack.Protected guard={!!conn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
          <Stack.Screen name="account/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="account/[id]/settings" options={{ headerShown: false }} />
          <Stack.Screen name="transaction/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="category/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="inbox" options={{ headerShown: false }} />
          <Stack.Screen name="import" options={{ headerShown: false }} />
          <Stack.Screen name="design-system" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!conn}>
          <Stack.Screen name="connect" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const theme = useTheme();
  const [loaded, error] = useFonts({ BricolageGrotesque_500Medium, BricolageGrotesque_800ExtraBold, Caveat_700Bold });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <ThemeProvider value={navTheme(theme)}>
      <StatusBar style={statusBarStyle(theme.mode)} />
      <LockGate>
        <QueryProvider>
          <AppStack />
        </QueryProvider>
      </LockGate>
    </ThemeProvider>
  );
}
