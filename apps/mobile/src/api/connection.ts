import * as SecureStore from 'expo-secure-store';
import type { Connection } from './types';

export type { Connection };

const URL_KEY = 'api.url';
const TOKEN_KEY = 'api.token';

export async function loadConnection(): Promise<Connection | null> {
  const [url, token] = await Promise.all([SecureStore.getItemAsync(URL_KEY), SecureStore.getItemAsync(TOKEN_KEY)]);
  return url && token ? { url, token } : null;
}

export async function saveConnection(c: Connection): Promise<void> {
  await SecureStore.setItemAsync(URL_KEY, c.url);
  await SecureStore.setItemAsync(TOKEN_KEY, c.token);
}

export async function clearConnection(): Promise<void> {
  await SecureStore.deleteItemAsync(URL_KEY);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
