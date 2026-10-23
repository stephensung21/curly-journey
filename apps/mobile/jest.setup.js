jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Font files can't load in Jest; treat fonts as loaded.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => {}),
  isLoaded: () => true,
}));

// Default: the phone has a screen lock and the user authenticates.
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(async () => ({ success: true })),
  getEnrolledLevelAsync: jest.fn(async () => 3),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

// Default: the app is connected. Tests needing "no connection" set globalThis.__cjConn = null.
// State lives on globalThis because expo-router's test renderer loads app code in its own module registry.
globalThis.__cjConn = { url: 'https://api.test', token: 'cj_test' };
globalThis.__cjSaved = [];
jest.mock('./src/api/connection', () => ({
  loadConnection: jest.fn(async () => globalThis.__cjConn),
  saveConnection: jest.fn(async c => {
    globalThis.__cjSaved.push(c);
  }),
  clearConnection: jest.fn(async () => {}),
}));
