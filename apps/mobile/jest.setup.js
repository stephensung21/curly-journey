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

// Native modules behind the drag-to-reorder list don't exist in Jest.
// Extend this Reanimated mock when new Reanimated APIs are used.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: c => c },
    clamp: (v, lo, hi) => Math.min(Math.max(v, lo), hi),
    runOnJS: fn => fn,
    useEvent: () => () => {},
    useSharedValue: v => ({ value: v }),
    useAnimatedStyle: fn => fn(),
  };
});
require('react-native-gesture-handler/jestSetup');
