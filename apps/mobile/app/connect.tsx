import { useRouter } from 'expo-router';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { apiFetch } from '../src/api/client';
import { useConnectionStore } from '../src/api/connectionStore';
import { useConnection } from '../src/api/hooks';
import { AppText } from '../src/components/AppText';
import { Button } from '../src/components/Button';
import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/theme/useTheme';

export default function Connect() {
  const t = useTheme();
  const router = useRouter();
  const { set } = useConnection();
  const authError = useConnectionStore(s => s.authError);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const conn = { url: url.trim(), token: token.trim() };
    if (!conn.url.startsWith('https://')) return setError('Use the https:// address of your API');
    if (!conn.token.startsWith('cj_')) return setError('Tokens start with cj_');
    setError(null);
    setBusy(true);
    try {
      const health = await fetch(`${conn.url.replace(/\/+$/, '')}/health`);
      if (!health.ok) throw new Error('health');
      await apiFetch(conn, '/accounts');
      await set(conn);
      router.replace('/');
    } catch {
      setError("Couldn't connect. Check the address and token.");
    } finally {
      setBusy(false);
    }
  };

  const input = {
    borderWidth: 1,
    borderColor: t.surfaceEdge,
    borderRadius: 12,
    padding: 12,
    color: t.ink,
    backgroundColor: t.surface,
  };

  return (
    <Screen style={{ gap: 12 }}>
      <AppText variant="title">Connect</AppText>
      {authError && <AppText tone="muted">That token didn't work. Paste a new one.</AppText>}
      <View style={{ gap: 6 }}>
        <AppText tone="muted">API URL</AppText>
        <TextInput
          accessibilityLabel="API URL"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://"
          placeholderTextColor={t.inkMuted}
          style={input}
        />
      </View>
      <View style={{ gap: 6 }}>
        <AppText tone="muted">Token</AppText>
        <TextInput
          accessibilityLabel="Token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="cj_"
          placeholderTextColor={t.inkMuted}
          style={input}
        />
      </View>
      {error && <AppText tone="muted">{error}</AppText>}
      <Button label={busy ? 'Connecting...' : 'Connect'} onPress={submit} disabled={busy} />
    </Screen>
  );
}
