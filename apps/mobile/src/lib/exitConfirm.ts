/** Back on the first tab, with no screen open on top of the tabs, would close the app: ask first (see ExitSheet). */
export function shouldConfirmExit(tabsFocused: boolean, pathname: string): boolean {
  return tabsFocused && pathname === '/';
}
