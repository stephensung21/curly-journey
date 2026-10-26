import { Alert, BackHandler } from 'react-native';

/** Back on the first tab, with no screen open on top of the tabs, would close the app: ask first. */
export function shouldConfirmExit(tabsFocused: boolean, pathname: string): boolean {
  return tabsFocused && pathname === '/';
}

/** Stay or Exit. Back again (or a tap outside) dismisses it and keeps the app open. */
export function confirmExit(): void {
  Alert.alert(
    'Exit Curly Journey?',
    undefined,
    [
      { text: 'Stay', style: 'cancel' },
      { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
    ],
    { cancelable: true },
  );
}
